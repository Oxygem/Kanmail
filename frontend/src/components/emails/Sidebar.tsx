import PropTypes from "prop-types";
import React from "react";

import { AppService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { subscribe } from "../../stores/base.tsx";
import settingsStore from "../../stores/settings.ts";
import systemStore from "../../stores/system.ts";
import Filters from "./Filters.jsx";
import FooterStatus from "./FooterStatus.tsx";

@subscribe(settingsStore, systemStore)
export default class Sidebar extends React.Component {
  static propTypes = {
    styleSettings: PropTypes.object.isRequired,
  };

  render() {
    return (
      <section id="sidebar">
        <header data-tauri-drag-region>
          <div className="wordmark" data-tauri-drag-region>
            <img src="/icon.png" alt="" />
            <span>Kanmail</span>
          </div>
        </header>

        {/* @ts-ignore */}
        <Filters />

        <footer>
          <div className="sb-foot-row">
            <span className="ver" onClick={() => AppService.OpenMetaWindow()}>
              Kanmail {systemStore.props.currentVersion || "2.unknown"}
            </span>
            {systemStore.props.isLicensed ? (
              <a className="lic" onClick={() => AppService.OpenSettingsWindow("license")}>
                Licensed
              </a>
            ) : (
              <a
                className="badge-up"
                onClick={() => AppService.OpenSettingsWindow("license")}
              >
                Upgrade
              </a>
            )}
          </div>
          {systemStore.props.isDebug && <span className="debug-link" onClick={() => AppService.OpenDebugWindow({})}>(debug)</span>}
          {/* @ts-ignore */}
          <FooterStatus />
        </footer>
      </section >
    );
  }
}
