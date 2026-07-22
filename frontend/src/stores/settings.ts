import _ from "lodash";
import { EmailsService, SettingsService } from "../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { AccountSettings, ColumnGroup, EventName, FolderName, Settings } from "../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import { Events } from "../../wails/runtime.js";
import { setupThemes } from "../theme.ts";
import { trackEvent } from "../util/analytics.ts";
import { arrayMove } from "../util/array.ts";
import { applyZoom } from "../zoom.ts";
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

		// The backend serves /kanmail-settings.js (loaded in index.html before
		// the bundle) which defines window.KANMAIL_SETTINGS, letting us hydrate
		// synchronously on boot without an IPC round trip. If the script fails
		// to load, getSettings() falls back to fetching over IPC.
		const injected = (window as any).KANMAIL_SETTINGS;
		if (injected) {
			this.setSettings(Settings.createFrom(injected));
		}
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

	// All columns across every workflow, not just the current one. Used to decide
	// whether a thread is "handled" in a column somewhere even if that column
	// isn't part of the currently displayed workflow.
	getAllColumns(): Array<string> {
		return _.uniq(_.flatMap(this.props.columnGroups, group => group.columns || []));
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
		name = name.trim();
		if (!name) {
			return;
		}
		this.savePrevProps();
		this.getCurrentColumns().push(name);
		await this.putSettings();
		trackEvent("AddColumn");
	}

	async removeColumn(index: number) {
		const columns = this.getCurrentColumns();
		if (index < 0 || index >= columns.length) {
			return;
		}
		this.savePrevProps();
		columns.splice(index, 1);
		await this.putSettings();
	}

	async moveColumn(index: number, position: number) {
		this.savePrevProps();
		const columns = this.getCurrentColumns();
		arrayMove(columns, index, index + position);
		await this.putSettings();
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

	async setCurrentAccount(accountID: string | null) {
		this.savePrevProps();
		const value = accountID || "";
		if (this.props.currentAccount != value) {
			this.props.currentAccount = value;
			await this.putSettings(["currentAccount"]);
		}
	}

	async putSettings(propNames?: string[]) {
		// If all accounts have IDs we can optimistically send the result to this window before
		// saving to make the app feel snappier. If we have un-ID-ed accounts we need to wait for
		// the backend to assign those.
		if (!_.some(this.props.accounts, account => account.id === "")) {
			this.triggerUpdate(propNames);
		}
		setupThemes(this.props);
		applyZoom(this.props.system.zoom);
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
		applyZoom(this.props.system.zoom);
		return this.props;
	}

	async getSettings(): Promise<ISettings> {
		// Hydrated synchronously from window.KANMAIL_SETTINGS in the constructor;
		// only hit IPC when that wasn't available (dev) or on an explicit refresh.
		if (this.hasFirstSet) {
			return this.props;
		}
		return this.refreshSettings();
	}

	async refreshSettings(): Promise<ISettings> {
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

	getAccountSettings(accountID: string): AccountSettings | undefined {
		return _.find(
			this.props.accounts,
			(account) => account.id === accountID,
		);
	}

	// Display name for an account ID, for user-facing labels
	getAccountName(accountID: string): string {
		return this.getAccountSettings(accountID)?.name || accountID;
	}

	getAccountAccentColor(accountID: string): string | undefined {
		const c = this.getAccountSettings(accountID)?.settings.accentColor;
		if (c === "transparent") {
			return undefined;
		}
		return c;
	}

	async clearOAuthAccessTokens() {
		await EmailsService.ClearOAuthAccessTokens();
	}

	async closeAccountConnections(accountID: string) {
		await EmailsService.CloseAccountConnections(accountID);
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
