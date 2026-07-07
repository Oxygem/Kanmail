import _ from "lodash";
import { EmailsService, SettingsService } from "../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { AccountSettings, ColumnGroup, EventName, FolderName, Settings } from "../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import { Events } from "../../wails/runtime.js";
import { setupThemes } from "../theme.ts";
import { trackEvent } from "../util/analytics.ts";
import { arrayMove } from "../util/array.ts";
import { BaseStore } from "./base.tsx";

export interface ISettings extends Settings {
}

class SettingsStore extends BaseStore {
	/*
		Global store of the users app settings.
	*/

	props: ISettings;
	prevProps: ISettings;

	// Flag to indicate first set of settings - ie false means we set props + prevProps
	hasFirstSet: boolean = false;

	constructor() {
		super();
		this.props = new Settings();
		this.prevProps = new Settings();
	}

	getCurrentColumns(): Array<string> {
		const group = this.props.columnGroups[this.props.currentColumnGroupIndex];
		if (!group) {
			return [];
		}
		if (!group.columns) {
			group.columns = [];
		}
		return group.columns;
	}

	getPrevColumns(): Array<string> {
		return this.prevProps.columnGroups[this.prevProps.currentColumnGroupIndex]?.columns || [];
	}

	// TODO: do wrapper function?
	savePrevProps() {
		this.prevProps = _.cloneDeep(this.props);
	}

	/*
		Workflow (column group) management for the toolbar switcher + manage modal.
		Workflows are an ordered list; duplicate names are allowed and the current
		one is tracked by index.
	*/

	private ensureColumnGroups() {
		// Safety net so a corrupt/empty settings file can never brick the board.
		if (_.isEmpty(this.props.columnGroups)) {
			this.props.columnGroups = [
				new ColumnGroup({ name: "Default", columns: ["inbox"] as FolderName[] }),
			];
			this.props.currentColumnGroupIndex = 0;
		}
		const index = this.props.currentColumnGroupIndex;
		if (index < 0 || index >= this.props.columnGroups.length) {
			this.props.currentColumnGroupIndex = 0;
		}
	}

	async switchColumnGroup(index: number, source: string = "unknown") {
		this.savePrevProps();
		this.props.currentColumnGroupIndex = index;
		await this.putSettings();
		trackEvent("WorkflowSwitch", { source });
	}

	async createColumnGroup(name: string, columns?: string[]) {
		const trimmed = name.trim();
		if (!trimmed) {
			throw new Error("workflow name required");
		}
		this.savePrevProps();
		this.props.columnGroups.push(new ColumnGroup({
			name: trimmed,
			columns: (columns || ["inbox"]) as FolderName[],
		}));
		this.props.currentColumnGroupIndex = this.props.columnGroups.length - 1;
		await this.putSettings();
		trackEvent("WorkflowCreate");
	}

	async renameColumnGroup(index: number, newName: string) {
		const group = this.props.columnGroups[index];
		const trimmed = newName.trim();
		if (!group || !trimmed || trimmed === group.name) {
			return;
		}
		this.savePrevProps();
		this.props.columnGroups[index]!.name = trimmed;
		await this.putSettings();
		trackEvent("WorkflowRename");
	}

	async duplicateColumnGroup(index: number) {
		const source = this.props.columnGroups[index];
		if (!source) {
			return;
		}
		this.savePrevProps();
		this.props.columnGroups.splice(index + 1, 0, new ColumnGroup({
			name: `${source.name} copy`,
			columns: [...source.columns],
		}));
		this.props.currentColumnGroupIndex = index + 1;
		await this.putSettings();
		trackEvent("WorkflowDuplicate");
	}

	async deleteColumnGroup(index: number) {
		if (this.props.columnGroups.length <= 1) {
			throw new Error("cannot delete the only workflow");
		}
		this.savePrevProps();
		this.props.columnGroups.splice(index, 1);
		const current = this.props.currentColumnGroupIndex;
		if (index < current) {
			this.props.currentColumnGroupIndex = current - 1;
		} else {
			this.props.currentColumnGroupIndex = Math.min(current, this.props.columnGroups.length - 1);
		}
		await this.putSettings();
		trackEvent("WorkflowDelete");
	}

	async reorderColumnGroups(fromIndex: number, toIndex: number) {
		this.savePrevProps();
		const current = this.props.columnGroups[this.props.currentColumnGroupIndex];
		arrayMove(this.props.columnGroups, fromIndex, toIndex);
		this.props.currentColumnGroupIndex = this.props.columnGroups.indexOf(current!);
		await this.putSettings();
		trackEvent("WorkflowReorder");
	}

	async setColumn(name: string, idx) {
		this.savePrevProps();
		this.getCurrentColumns()[idx] = name;
		await this.putSettings();
	}

	async addColumn(name: string) {
		this.savePrevProps();
		this.getCurrentColumns().push(name);
		await this.putSettings();
		trackEvent("AddColumn");
	}

	async removeColumn(name: string) {
		const group = this.props.columnGroups[this.props.currentColumnGroupIndex];
		if (!group) {
			return;
		}
		this.savePrevProps();
		group.columns = _.without(group.columns, name as FolderName);
		await this.putSettings();
	}

	async moveColumn(name: string, position: number) {
		this.savePrevProps();
		const columns = this.getCurrentColumns();
		const index = columns.indexOf(name);
		arrayMove(columns, index, index + position);
		await this.putSettings();
	}

	async moveColumnLeft(name: string) {
		await this.moveColumn(name, -1);
	}

	async moveColumnRight(name: string) {
		await this.moveColumn(name, 1);
	}

	async addSidebarFolder(name: string) {
		if (this.props.sidebarFolders.indexOf(name) > -1) {
			return;
		}

		this.props.sidebarFolders.push(name);
		await this.putSettings(["sidebarFolders"]);
	}

	async removeSidebarFolder(name: string) {
		if (this.props.sidebarFolders.indexOf(name) < 0) {
			return;
		}

		this.props.sidebarFolders = _.without(
			this.props.sidebarFolders,
			name,
		);
		await this.putSettings(["sidebarFolders"]);
	}

	async setCurrentAccount(accountName: string | null) {
		this.savePrevProps();
		const value = accountName || "";
		if (this.props.currentAccount != value) {
			this.props.currentAccount = value;
			await this.putSettings(["currentAccount"]);
		}
	}

	async putSettings(propNames?: string[]) {
		// Immediately send the result to this window before saving
		this.triggerUpdate(propNames);
		setupThemes(this.props);
		return SettingsService.PutSettings(this.props);
	}

	setSettings(settings: ISettings) {
		// When calling putSettings we immediately apply the settings, then save. The save
		// then calls this via the SettingsChangedEvent.
		if (_.isEqual(this.props, settings)) {
			console.log("[settingsStore] Skip applying identical settings");
			return this.props;
		}

		this.props = settings;
		this.ensureColumnGroups();
		if (!this.hasFirstSet) {
			this.savePrevProps();
			this.hasFirstSet = true;
		}
		this.triggerUpdate();

		// Apply any theme changes (gross?)
		setupThemes(this.props);
		return this.props;
	}

	async getSettings(): Promise<ISettings> {
		return SettingsService.GetSettings().then((settings) => {
			this.setSettings(settings);
			return settings;
		});
	}

	async updateSettings(settings: Partial<Settings>) {
		this.props = {
			...this.props,
			...settings,
		};
		await this.putSettings();
	}

	getAccountSettings(accountName: string): AccountSettings | undefined {
		return _.find(
			this.props.accounts,
			(account) => account.name === accountName,
		);
	}

	getAccountAccentColor(accountName: string): string | undefined {
		const c = this.getAccountSettings(accountName)?.settings.accentColor;
		if (c === "transparent") {
			return undefined;
		}
		return c;
	}

	async clearOAuthAccessTokens() {
		await EmailsService.ClearOAuthAccessTokens();
	}

	async closeAccountConnections(accountName: string) {
		await EmailsService.CloseAccountConnections(accountName);
	}
}

const settingsStore = new SettingsStore();

// @ts-ignore
window.settingsStore = settingsStore;
export default settingsStore;

Events.On(EventName.SettingsChangedEvent, (ev) => {
	console.debug("[settingsStore] Received settings changed event", ev);
	settingsStore.setSettings(ev.data);
});
