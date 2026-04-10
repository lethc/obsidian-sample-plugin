import {
	App,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	MarkdownView,
} from 'obsidian'
import { spawn } from 'child_process'

interface ScriptRunnerSettings {
	projectPath: string
	scriptPath: string
	uvPath: string
}

const DEFAULT_SETTINGS: ScriptRunnerSettings = {
	projectPath: '/ruta/a/tu/proyecto',
	scriptPath: '/ruta/a/tu/proyecto/script.py',
	uvPath: 'uv',
}

export default class ScriptRunnerPlugin extends Plugin {
	settings: ScriptRunnerSettings

	async onload() {
		await this.loadSettings()

		this.addRibbonIcon('brain', 'Ejecutar mi script', () => {
			this.runScript()
		})

		this.addCommand({
			id: 'run-my-script',
			name: 'Ejecutar mi script Python (uv)',
			callback: () => {
				this.runScript()
			},
		})

		this.addSettingTab(new ScriptRunnerSettingTab(this.app, this))
	}

	onunload() {}

	runScript() {
		const { projectPath, scriptPath, uvPath } = this.settings

		if (!scriptPath || scriptPath === DEFAULT_SETTINGS.scriptPath) {
			new Notice(
				'⚠️ Configura las rutas del proyecto en los ajustes del plugin.',
			)
			return
		}

		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView)
		if (!activeView) {
			new Notice('⚠️ Abre un archivo Markdown primero.')
			return
		}

		const file = activeView.file
		if (!file) {
			new Notice('⚠️ No se pudo obtener el archivo activo.')
			return
		}

		const vaultPath = (this.app.vault.adapter as any).basePath as string
		const absoluteFilePath = `${vaultPath}/${file.path}`

		const modal = new OutputModal(this.app, file.name)
		modal.open()

		const args = [
			'run',
			'--project',
			projectPath,
			scriptPath,
			absoluteFilePath,
		]
		const child = spawn(uvPath, args, {
			env: {
				...process.env,
				PATH:
					process.env.PATH +
					':/home/LostOnTheSeas/.local/bin:/usr/local/bin',
			},
		})

		child.stdout.on('data', (data: Buffer) => {
			modal.appendOutput(data.toString())
		})

		child.stderr.on('data', (data: Buffer) => {
			modal.appendOutput(data.toString())
		})

		child.on('close', (code: number) => {
			if (code === 0) {
				modal.setDone('✅ Script finalizado correctamente.')
			} else {
				modal.setDone(`❌ Script terminó con código de error: ${code}`)
			}
		})

		child.on('error', (err: Error) => {
			modal.appendOutput(`\n[ERROR] ${err.message}\n`)
			modal.setDone(
				'❌ No se pudo iniciar el proceso. ¿Es correcta la ruta de uv?',
			)
		})
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<ScriptRunnerSettings>,
		)
	}

	async saveSettings() {
		await this.saveData(this.settings)
	}
}

// ── Modal con output en tiempo real ──────────────────────────────────────────
class OutputModal extends Modal {
	private outputEl: HTMLPreElement
	private statusEl: HTMLParagraphElement
	private fileName: string

	constructor(app: App, fileName: string) {
		super(app)
		this.fileName = fileName
	}

	onOpen() {
		const { contentEl } = this
		contentEl.empty()

		contentEl.createEl('h3', {
			text: `▶ Ejecutando script en ${this.fileName}`,
		})

		// Contenedor estilo terminal
		const wrapper = contentEl.createDiv()
		wrapper.style.cssText = `
			background: var(--background-primary-alt);
			border: 1px solid var(--background-modifier-border);
			border-radius: 6px;
			padding: 12px;
			margin: 12px 0;
			max-height: 400px;
			overflow-y: auto;
		`

		this.outputEl = wrapper.createEl('pre')
		this.outputEl.style.cssText = `
			margin: 0;
			font-family: var(--font-monospace);
			font-size: 12px;
			white-space: pre-wrap;
			word-break: break-all;
			color: var(--text-normal);
		`
		this.outputEl.setText('Iniciando…\n')

		this.statusEl = contentEl.createEl('p')
		this.statusEl.style.cssText = `
			font-size: 13px;
			color: var(--text-muted);
			margin: 4px 0 0;
		`
		this.statusEl.setText('⏳ En ejecución…')
	}

	appendOutput(text: string) {
		this.outputEl.textContent += text
		// Auto-scroll al final
		const wrapper = this.outputEl.parentElement
		if (wrapper) wrapper.scrollTop = wrapper.scrollHeight
	}

	setDone(message: string) {
		this.statusEl.setText(message)
		this.statusEl.style.color = message.startsWith('✅')
			? 'var(--color-green)'
			: 'var(--color-red)'
	}

	onClose() {
		this.contentEl.empty()
	}
}

// ── Pestaña de ajustes ────────────────────────────────────────────────────────
class ScriptRunnerSettingTab extends PluginSettingTab {
	plugin: ScriptRunnerPlugin

	constructor(app: App, plugin: ScriptRunnerPlugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	display(): void {
		const { containerEl } = this
		containerEl.empty()
		containerEl.createEl('h2', { text: 'Script Runner — Configuración' })

		new Setting(containerEl)
			.setName('Directorio del proyecto')
			.setDesc('Carpeta raíz del proyecto uv (donde está pyproject.toml)')
			.addText((text) =>
				text
					.setPlaceholder(
						'/home/LostOnTheSeas/Workspace/ML/md_to_anki',
					)
					.setValue(this.plugin.settings.projectPath)
					.onChange(async (value) => {
						this.plugin.settings.projectPath = value.trim()
						await this.plugin.saveSettings()
					}),
			)

		new Setting(containerEl)
			.setName('Ruta al script Python')
			.setDesc('Ruta absoluta al archivo .py a ejecutar')
			.addText((text) =>
				text
					.setPlaceholder(
						'/home/LostOnTheSeas/Workspace/ML/md_to_anki/md_to_anki.py',
					)
					.setValue(this.plugin.settings.scriptPath)
					.onChange(async (value) => {
						this.plugin.settings.scriptPath = value.trim()
						await this.plugin.saveSettings()
					}),
			)

		new Setting(containerEl)
			.setName('Ejecutable de uv')
			.setDesc('Ruta absoluta a uv si no está en el PATH de Obsidian')
			.addText((text) =>
				text
					.setPlaceholder('uv')
					.setValue(this.plugin.settings.uvPath)
					.onChange(async (value) => {
						this.plugin.settings.uvPath = value.trim()
						await this.plugin.saveSettings()
					}),
			)
	}
}
