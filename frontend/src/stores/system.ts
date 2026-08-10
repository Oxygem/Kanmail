import { Version } from "../../bindings/github.com/oxygem/kanmail/internal/backend/models.ts";
import { AppService, SettingsService } from "../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { EventName } from "../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import { Events, System } from "../../wails/runtime.js";
import { applyThemes } from "../theme.ts";
import { BaseStore } from "./base.tsx";

export interface ISystem {
    logFilename: string;
    executableFilename: string;
    currentVersion: string;
    isDebug: boolean;
    isLicensed: boolean;
    hasUpdate: boolean;
    update?: Version;
}

class SystemStore extends BaseStore {
    props: ISystem;

    constructor() {
        super();
        this.props = {
            logFilename: "",
            executableFilename: "",
            currentVersion: "",
            isDebug: false,
            isLicensed: false,
            hasUpdate: false,
        };
    }

    async getLogFilename(): Promise<void> {
        const logFilename = await SettingsService.GetLogFilename();
        if (logFilename !== this.props.logFilename) {
            this.props.logFilename = logFilename;
            this.triggerUpdate(["logFilename"]);
        }
    }

    async getExecutableFilename(): Promise<void> {
        const executableFilename = await AppService.GetExecutable();
        if (executableFilename !== this.props.executableFilename) {
            this.props.executableFilename = executableFilename;
            this.triggerUpdate(["executableFilename"]);
        }
    }

    async checkCachedLicense(): Promise<void> {
        const isLicensed = await AppService.CheckCachedLicense();
        if (isLicensed !== this.props.isLicensed) {
            this.props.isLicensed = isLicensed;
            this.triggerUpdate(["isLicensed"]);
        }
    }

    async checkCurrentVersion(): Promise<void> {
        const currentVersion = await AppService.GetCurrentVersion();
        if (currentVersion === this.props.currentVersion) {
            return;
        }
        this.props.currentVersion = currentVersion;
        this.triggerUpdate(["currentVersion"]);
    }

    async checkDebug(): Promise<void> {
        const isDebug = (await System.Environment()).Debug;
        if (isDebug !== this.props.isDebug) {
            this.props.isDebug = isDebug;
            this.triggerUpdate(["isDebug"]);
        }
    }

    async checkLicense(): Promise<void> {
        const hasLicense = await AppService.CheckLicense();
        if (hasLicense === this.props.isLicensed) {
            return;
        }
        this.props.isLicensed = hasLicense;
        this.triggerUpdate(["isLicensed"]);
        // Locked themes depend on the license, so re-apply now we know
        applyThemes();
    }

    async checkUpdate(): Promise<void> {
        const update = await AppService.CheckUpdate();
        const hasUpdate = update !== null;
        if (hasUpdate === this.props.hasUpdate) {
            return;
        }
        this.props.update = update || undefined;
        this.props.hasUpdate = hasUpdate;
        this.triggerUpdate(["update", "hasUpdate"]);
    }
}

const systemStore = new SystemStore();

// @ts-ignore
window.systemStore = systemStore;
export default systemStore;

Events.On(EventName.LicenseChangedEvent, (ev) => {
    console.debug("[systemStore] Received license changed event", ev);
    systemStore.checkLicense();
});
