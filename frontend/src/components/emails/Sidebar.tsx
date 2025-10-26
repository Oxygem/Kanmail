import PropTypes from "prop-types";
import React from "react";

import { AppService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { subscribe } from "../../stores/base.tsx";
import searchStore from "../../stores/search.js";
import settingsStore from "../../stores/settings.ts";
import systemStore from "../../stores/system.ts";
import { trackEvent } from "../../util/analytics.ts";
import HeaderErrors from "../HeaderErrors.tsx";
import Tooltip from "../Tooltip.tsx";
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
          {/* @ts-ignore */}
          <HeaderErrors />
          <div className="buttons" data-tauri-drag-region>
            <div className="logo" data-tauri-drag-region>
              <span>K-</span>
              <i className="logo fa fa-envelope-o"></i>
            </div>
            <div>
              <Tooltip
                text={
                  <span>
                    Search (<i className="fa fa-keyboard-o" /> /)
                  </span>
                }
              >
                <a
                  className="search"
                  onClick={() => {
                    searchStore.toggle()
                    trackEvent("SidebarToggleSearch")
                  }}
                >
                  <i className="fa fa-search"></i>
                </a>
              </Tooltip>
              <Tooltip
                text={
                  <span>
                    Compose (<i className="fa fa-keyboard-o" /> c)
                  </span>
                }
              >
                <a
                  className="compose"
                  onClick={() => {
                    AppService.OpenSendWindow({})
                    trackEvent("SidebarOpenSend")
                  }}
                >
                  <i className="fa fa-pencil-square-o"></i>
                </a>
              </Tooltip>
            </div>
          </div>
        </header>

        {/* @ts-ignore */}
        <Filters />

        <footer>
          <a onClick={() => AppService.OpenLicenseWindow()}>
            {systemStore.props.isLicensed ? "Licensed" : "Unlicensed"}
          </a>
          <br />
          <span onClick={() => AppService.OpenMetaWindow()}>
            Kanmail {systemStore.props.currentVersion || "2.unknown"}
          </span>{" "}
          {systemStore.props.isDebug && <span onClick={() => AppService.OpenDebugWindow()}>(debug)</span>}
          {/* @ts-ignore */}
          <FooterStatus />
        </footer>
      </section >
    );
  }
}
