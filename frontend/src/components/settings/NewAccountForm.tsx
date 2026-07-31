import _ from "lodash";
import React from "react";

import { AccountsService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { OAuthRequest } from "../../../bindings/github.com/oxygem/kanmail/internal/services/models.ts";
import { AccountSettings, Address } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import ColorPicker from "../../components/ColorPicker.tsx";
import {
	ACCOUNT_ACCENT_COLORS,
	APPLE_APP_PASSWORD_LINK,
	SETUP_GMAIL_DOC_LINK,
	SETUP_IMAP_DOC_LINK,
	SETUP_OUTLOOK_DOC_LINK,
} from "../../constants.ts";
import settingsStore from "../../stores/settings.ts";
import { getNextAccentColor } from "../../util/accounts.ts";
import { trackEvent } from "../../util/analytics.ts";
import { normalizeError } from "../../util/error.ts";
import { openLink } from "../../window.ts";
import AccountForm from "./AccountForm.tsx";

function deriveNameFromEmail(email: string): string {
	const local = email.split("@")[0];
	return local
		.split(/[._\-+]/)
		.filter(Boolean)
		.map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
		.join(" ");
}

// Providers that no longer accept passwords for IMAP/SMTP - autoconfigure finds
// their servers just fine, so offer a sign in button for oauth.
const OAUTH_PROVIDERS = [
	{
		accountType: "gmail",
		name: "Google",
		docLink: SETUP_GMAIL_DOC_LINK,
		domains: ["gmail.com", "googlemail.com"],
	},
	{
		accountType: "outlook",
		name: "Outlook",
		docLink: SETUP_OUTLOOK_DOC_LINK,
		domains: ["outlook.com", "hotmail.com", "live.com", "msn.com", "office365.com"],
	},
];

type OauthProvider = (typeof OAUTH_PROVIDERS)[number];

// Matches on the autoconfigured hosts as well as the email domain, so accounts
// on a custom domain (Google Workspace, Microsoft 365) are caught too.
function getOauthProviderForSettings(settings: AccountSettings | null): OauthProvider | null {
	if (!settings) {
		return null;
	}

	const hosts = _.filter([
		settings.imapSettings?.host,
		settings.smtpSettings?.host,
		(settings.imapSettings?.username || "").split("@")[1],
	]).map((host) => host.toLowerCase());

	return _.find(OAUTH_PROVIDERS, (provider) =>
		_.some(hosts, (host) =>
			_.some(provider.domains, (domain) => host === domain || host.endsWith(`.${domain}`)),
		),
	) || null;
}

interface GenericAccountFormProps {
	accountType: string;
	closeForm: () => void;
	handleAddAccountError: (s: AccountSettings, e: string) => void;
	completeAddNewAccount: (s: AccountSettings) => void;
	handleClickManualAddAccount: () => void;
}

interface GenericAccountFormState {
	newAccountError: null | React.ReactNode | string;
	newAccountUsername: string;
	newAccountPassword: string;

	newAccountSettings: AccountSettings | null;
	newAccountName: string;
	newAccountAddressEmail: string;
	newAccountAddressName: string;
	newAccountAccentColor: string;

	isLoadingNewAccount: boolean;

	oauthError: string | null;
	oauthRequestId: string | null;
	oauthRequestUrl: string | null;

	showColorPicker?: boolean;
}

class GenericAccountForm extends React.Component<GenericAccountFormProps, GenericAccountFormState> {
	constructor(props) {
		super(props);
		this.state = {
			isLoadingNewAccount: false,

			newAccountError: null,

			// First phase
			newAccountUsername: "",
			newAccountPassword: "",

			// Second phase
			newAccountSettings: null,
			newAccountName: "",
			newAccountAddressEmail: "",
			newAccountAddressName: "",
			newAccountAccentColor: getNextAccentColor(settingsStore.props.accounts),

			oauthError: null,
			oauthRequestId: null,
			oauthRequestUrl: null,
		};
	}

	getAutoconfDomain(): string {
		return "";
	}

	handleAddAccount = (ev) => {
		ev.preventDefault();

		if (this.state.isLoadingNewAccount) {
			return;
		}

		if (!this.state.newAccountUsername || !this.state.newAccountPassword) {
			this.setState({
				newAccountError: "Email or password missing!",
			});
			return;
		}

		const data = {
			username: this.state.newAccountUsername,
			password: this.state.newAccountPassword,
			autoconf_domain: this.getAutoconfDomain(),
		};

		const handleSettings = (data: AccountSettings) => {
			if (data.folders.inbox == "") {
				this.setState({
					newAccountError: (
						<span>
							Invalid email or password! You may need to enable IMAP access with
							your provider. See{" "}
							<button
								type="button"
								className="manual"
								onClick={() => openLink(SETUP_IMAP_DOC_LINK)}
							>our help page for more information</button>.
						</span>
					),
					isLoadingNewAccount: false,
				});
				return;
			}

			this.setState({
				newAccountError: null,
				newAccountAddressEmail: this.state.newAccountUsername,
				newAccountAddressName: deriveNameFromEmail(this.state.newAccountUsername),
				newAccountName: data.imapSettings.username,
				newAccountSettings: data,
			});
			trackEvent("AddAccountAutoconfigSuccess", { accountType: this.props.accountType });

			return;
		};

		const handleError = (error: any) => {
			error = normalizeError(error);
			let settings = getEmptyAccountSettings();
			if (error.cause && error.cause.settings) {
				settings = AccountSettings.createFrom(error.cause.settings);
			}

			_.each([settings.imapSettings, settings.smtpSettings], (connection) => {
				connection.username = connection.username || this.state.newAccountUsername;
				connection.password = connection.password || this.state.newAccountPassword;
			});

			this.props.handleAddAccountError(settings, error.message);
		}
		this.setState({ isLoadingNewAccount: true });
		trackEvent("AddAccountAutoconfigAttempt", { accountType: this.props.accountType });

		AccountsService.AutoconfigureNewAccount(
			this.state.newAccountUsername,
			{
				password: this.state.newAccountPassword,
				domain: this.getAutoconfDomain(),
			},
		)
			.then(handleSettings)
			.catch(handleError);
	};

	handleCompleteAddAccount = (ev) => {
		ev.preventDefault();

		if (!this.state.newAccountSettings) {
			throw new Error("missing settings");
		}

		if (!this.state.newAccountName) {
			this.setState({
				newAccountError: "Please provide an account display name!",
			});
			return;
		}

		const settings = this.state.newAccountSettings;
		settings.name = this.state.newAccountName;
		settings.settings.accentColor = this.state.newAccountAccentColor;
		settings.contacts = [
			new Address({
				name: this.state.newAccountAddressName,
				email: this.state.newAccountAddressEmail,
			}),
		];

		this.props.completeAddNewAccount(settings);
	};

	handleUpdate = (stateKey: keyof GenericAccountFormState, ev) => {
		// @ts-ignore TODO
		this.setState({
			[stateKey]: ev.target.value,
		});
	};

	renderTitle() {
		return (
			<h3>
				<i className="fa fa-envelope" /> Add New Account
			</h3>
		);
	}

	renderUnderTitle(): React.ReactNode | null {
		return <p>
			Automatically setup an account using email and password.
			&nbsp;<button
				className="manual"
				onClick={this.props.handleClickManualAddAccount}
				type="button"
			>Set IMAP/SMTP settings manually
			</button>
		</p>;
	}

	renderNewAccountForm() {
		return (
			<div className="new-account">
				{this.renderUnderTitle()}
				<div className="flex">
					<div className="input half">
						<label htmlFor="username">Email</label>
						<input
							id="username"
							type="email"
							value={this.state.newAccountUsername}
							onChange={_.partial(this.handleUpdate, "newAccountUsername")}
						/>
					</div>

					<div className="input half">
						<label htmlFor="password">Password</label>
						<input
							id="password"
							type="password"
							value={this.state.newAccountPassword}
							onChange={_.partial(this.handleUpdate, "newAccountPassword")}
						/>
					</div>
				</div>

				<div className="account-control-buttons">
					<button
						type="submit"
						className={`submit main-button`}
						onClick={this.handleAddAccount}
						disabled={this.state.isLoadingNewAccount}
					>
						{this.state.isLoadingNewAccount && <i className="fa fa-spin fa-refresh"></i>}
						Add account
					</button>
					<button
						type="button"
						className="cancel"
						onClick={this.props.closeForm}
						disabled={this.state.isLoadingNewAccount}
					>
						Cancel
					</button>
				</div>
			</div>
		);
	}

	renderCompleteNewAccountForm() {
		return (
			<div>
				<p>
					Account <span className="green">connected</span>! Customize the new
					account below:
				</p>
				<div className="input">
					<div className="flex">
						<div className="two-third">
							<label htmlFor="account-name">
								Account display name (eg Work, Personal)
							</label>
							<input
								id="account-name"
								value={this.state.newAccountName}
								onChange={_.partial(this.handleUpdate, "newAccountName")}
							/>
						</div>
						<div className="third">
							<div>
								<label>
									Accent Color
								</label>
							</div>
							<ColorPicker
								color={this.state.newAccountAccentColor}
								onChange={(newAccountAccentColor) => this.setState({ newAccountAccentColor })}
								isOpen={this.state.showColorPicker || false}
								onToggle={() => this.setState({ showColorPicker: !this.state.showColorPicker })}
								onClose={() => this.setState({ showColorPicker: false })}
								onClear={() => this.setState({ newAccountAccentColor: "transparent" })}
								showClear={this.state.newAccountAccentColor !== "transparent"}
								colors={ACCOUNT_ACCENT_COLORS}
							/>
						</div>
					</div>
				</div>

				<div className="input">
					<label htmlFor="address-email">Email address to send from</label>
					<input
						id="address-email"
						type="email"
						value={this.state.newAccountAddressEmail}
						onChange={_.partial(this.handleUpdate, "newAccountAddressEmail")}
					/>
				</div>

				<div className="input">
					<label htmlFor="address-name">Name to send from</label>
					<input
						id="address-name"
						value={this.state.newAccountAddressName}
						onChange={_.partial(this.handleUpdate, "newAccountAddressName")}
					/>
				</div>

				<div className="account-control-buttons">
					<button
						type="submit"
						className="submit main-button"
						onClick={this.handleCompleteAddAccount}
					>Complete adding account</button>
					<button className="cancel" onClick={this.props.closeForm}>Cancel</button>
				</div>
			</div>
		);
	}

	render() {
		return (
			<form
				className="account new-account zz"
				onSubmit={(ev) => {
					ev.preventDefault();
					if (this.state.newAccountSettings) {
						this.handleCompleteAddAccount(ev);
					} else {
						this.handleAddAccount(ev);
					}
				}}
			>
				<div className="account-overlay">
					<div className="account-overlay-content">
						{this.renderTitle()}
						<div className="setup-steps">
							<span className={this.state.newAccountSettings ? "" : "active"}>1. Sign in</span>
							<span className="separator">&rarr;</span>
							<span className={this.state.newAccountSettings ? "active" : ""}>2. Customize</span>
						</div>
						{this.state.newAccountError && (
							<div className="error">{this.state.newAccountError}</div>
						)}
						{this.state.newAccountSettings
							? this.renderCompleteNewAccountForm()
							: this.renderNewAccountForm()}
					</div>
				</div>
			</form>
		);
	}
}

class OauthAccountFormMixin extends GenericAccountForm {
	oauthRequestCheck: ReturnType<typeof setInterval> | null = null;

	componentDidMount() {
		this.startOauthRequest();
	}

	componentWillUnmount() {
		this.stopOauthPoll();
	}

	stopOauthPoll = () => {
		if (this.oauthRequestCheck) {
			clearInterval(this.oauthRequestCheck);
			this.oauthRequestCheck = null;
		}
	};

	getProviderName(): string {
		const provider = _.find(
			OAUTH_PROVIDERS,
			({ accountType }) => accountType === this.props.accountType,
		);
		return provider ? provider.name : this.props.accountType;
	}

	startOauthRequest = () => {
		this.stopOauthPoll();
		this.setState({
			oauthError: null,
			oauthRequestId: null,
			oauthRequestUrl: null,
		});

		AccountsService.StartOAuthRequest(this.getOauthProvider()).then((v: OAuthRequest) => {
			this.setState({
				oauthRequestId: v.uid,
				oauthRequestUrl: v.url,
			});
			this.oauthRequestCheck = setInterval(this.checkForOauthRequest, 100);
			trackEvent("AddAccountOAuthStarted", { accountType: this.props.accountType });
		}).catch((e) => {
			e = normalizeError(e);
			this.setState({
				oauthError: `Could not start sign in with ${this.getProviderName()}: ${e.message}`,
			});
		});
	};

	checkForOauthRequest = () => {
		if (!this.state.oauthRequestId) {
			return;
		}

		AccountsService.GetOAuthResponse(this.state.oauthRequestId).then((resp) => {
			if (!resp) {
				return
			}
			this.stopOauthPoll();

			// The provider bounced the user back without a token - they hit
			// cancel or something rejected the sign in, either way there's
			// nothing left to wait for
			if (resp.cancelled || resp.error) {
				const name = this.getProviderName();
				this.setState({
					oauthError: resp.cancelled
						? `Sign in with ${name} was cancelled.`
						: `Sign in with ${name} failed: ${resp.error}`,
					oauthRequestId: null,
					isLoadingNewAccount: false,
				});
				trackEvent(resp.cancelled ? "AddAccountOAuthCancelled" : "AddAccountOAuthFailed", {
					accountType: this.props.accountType,
				});
				return;
			}

			trackEvent("AddAccountOAuthResponse", { accountType: this.props.accountType });
			this.setState({ isLoadingNewAccount: true });

			const data = {
				domain: this.getAutoconfDomain(),
				oauthRefreshToken: resp.refreshToken,
				oauthProvider: this.getOauthProvider(),
			};

			AccountsService.AutoconfigureNewAccount(resp.email, data).then(settings => {
				this.setState({
					newAccountAddressEmail: resp.email,
					newAccountAddressName: deriveNameFromEmail(resp.email),
					newAccountName: settings.imapSettings.username || resp.email,
					newAccountSettings: settings,
					isLoadingNewAccount: false,
				});
			}).catch(e => {
				e = normalizeError(e);

				this.setState({
					newAccountError: "Authentication failed!",
					isLoadingNewAccount: false,
				});

				let settings = getEmptyAccountSettings();
				if (e.cause && e.cause.settings) {
					settings = AccountSettings.createFrom(e.cause.settings);
				}

				this.props.handleAddAccountError(settings, e.message);
			})
		}).catch((e) => {
			// Keeping the interval running would repeat whatever just failed
			// every tick, and it can't fix itself
			this.stopOauthPoll();
			e = normalizeError(e);
			this.setState({ oauthError: `Sign in failed: ${e.message}` });
		});
	};

	getOauthProvider(): string {
		return ""
	}

	getAutoconfDomain(): string {
		return "";
	}

	renderTitle() {
		return (
			<h3>
				<img src={""} /> Add Generic Account
			</h3>
		);
	}

	renderNewAccountForm() {
		if (this.state.isLoadingNewAccount) {
			return (
				<>
					<p><i className="fa fa-refresh fa-spin" /> Setting up account...</p>
					<div className="account-control-buttons">
						<button type="button" className="cancel" onClick={this.props.closeForm}>
							Cancel
						</button>
					</div>
				</>
			);
		}

		if (this.state.oauthError) {
			return (
				<>
					<div className="error">{this.state.oauthError}</div>
					<div className="account-control-buttons">
						<button
							type="button"
							className="submit main-button"
							onClick={this.startOauthRequest}
						>
							<i className="fa fa-refresh" /> Try again
						</button>
						<button type="button" className="cancel" onClick={this.props.closeForm}>
							Cancel
						</button>
					</div>
				</>
			);
		}

		return (
			<>
				<p>
					<i className="fa fa-refresh fa-spin" />{" "}
					Waiting for confirmation from {this.getProviderName()}...
				</p>
				<p>Nothing happening or not working? Try opening this URL in your web browser:</p>
				<pre className="wrap">{this.state.oauthRequestUrl}</pre>
				<div className="account-control-buttons">
					<button type="button" className="cancel" onClick={this.props.closeForm}>
						Cancel
					</button>
				</div>
			</>
		);
	}
}

class GmailAccountForm extends OauthAccountFormMixin {
	getOauthProvider() {
		return "gmail";
	}

	getAutoconfDomain() {
		return "gmail.com";
	}

	renderTitle() {
		return (
			<h3>
				<img src="/providers/gmail.png" /> Sign in with Google
			</h3>
		);
	}
}

class OutlookAccountForm extends OauthAccountFormMixin {
	getOauthProvider() {
		return "outlook"
	}

	getAutoconfDomain() {
		return "outlook.com";
	}

	renderTitle() {
		return (
			<h3>
				<img src="/providers/outlook.png" /> Add Outlook Account
			</h3>
		);
	}

	renderUnderTitle() {
		return null;
	}
}

class ICloudAccountForm extends GenericAccountForm {
	getAutoconfDomain() {
		return "icloud.com";
	}

	renderTitle() {
		return (
			<h3>
				<img src="/providers/icloud.png" /> Add iCloud Account
			</h3>
		);
	}

	renderUnderTitle() {
		return (
			<p>
				iCloud accounts must use an{" "}
				<a onClick={() => openLink(APPLE_APP_PASSWORD_LINK)}>
					app specific password
				</a>.
			</p>
		);
	}
}

const ACCOUNT_TYPE_TO_COMPONENT = {
	gmail: GmailAccountForm,
	icloud: ICloudAccountForm,
	outlook: OutlookAccountForm,
	// yahoo: YahooAccountForm,
	generic: GenericAccountForm,
};

const getInitialState = (): NewAccountFormState => ({
	accountType: "",

	// Add account phase 1 - name/username/password autoconfig form
	newAccountError: null,

	// Add account phase 2 - manual config if auto fails
	isLoadingNewAccount: false,
	manuallyConfiguringAccount: false,
	showErrorRecovery: false,
	autoconfigError: "",
	newAccountSettings: null,
});

const getEmptyAccountSettings = (): AccountSettings => (new AccountSettings());

interface NewAccountFormProps {
	addItem: (any) => void;
	onClose?: (any) => void;
}

interface NewAccountFormState {
	newAccountError: null | React.ReactNode | string;

	accountType: string;

	isLoadingNewAccount: boolean;
	manuallyConfiguringAccount: boolean;
	showErrorRecovery: boolean;
	autoconfigError: string;

	newAccountSettings: AccountSettings | null;
}

export default class NewAccountForm extends React.Component<NewAccountFormProps, NewAccountFormState> {
	constructor(props) {
		super(props);
		this.state = getInitialState();
	}

	resetState = () => {
		this.setState(getInitialState());
	};

	handleAddAccountError = (settings: AccountSettings, error: string) => {
		this.setState({
			isLoadingNewAccount: false,
			showErrorRecovery: true,
			newAccountSettings: settings,
			autoconfigError: error,
		});
		const imapUsernameBits = settings.imapSettings.username.split("@");
		trackEvent("AddAccountError", {
			accountType: this.state.accountType,
			// Server errors quote the address they failed to log in with, so
			// strip any of those out before this leaves the device
			error: error.replace(/[^\s@]+@[^\s@]+/g, "<address>"),
			domain: imapUsernameBits[imapUsernameBits.length - 1], // domain only, no PII
		});
	};

	// Whatever autoconfigure did work out (hosts, ports, credentials) carries
	// over, so manual setup starts from it rather than from an empty form
	startManualConfig = (settings: AccountSettings) => {
		const { username } = settings.imapSettings;
		if (username) {
			settings.name = settings.name || username;
			if (_.isEmpty(settings.contacts)) {
				settings.contacts = [new Address({
					name: deriveNameFromEmail(username),
					email: username,
				})];
			}
		}

		this.setState({
			isLoadingNewAccount: false,
			showErrorRecovery: false,
			manuallyConfiguringAccount: true,
			newAccountSettings: settings,
			newAccountError: this.state.autoconfigError || null,
		});
	};

	handleClickManualAddAccount = () => {
		this.startManualConfig(getEmptyAccountSettings());
		trackEvent("AddAccountManual");
	};

	completeAddNewAccount = (accountSettings: AccountSettings) => {
		this.props.addItem(accountSettings);
		this.resetState();
		trackEvent("AddAccountComplete", {
			accountType: this.state.accountType,
		});
	};

	setAccountType = (accountType: string) => {
		this.setState({ accountType });
		trackEvent("AddAccountStart", {
			accountType: accountType,
		});
	};

	renderErrorRecovery() {
		const settings = this.state.newAccountSettings;
		const error = this.state.autoconfigError;
		const lowerError = error.toLowerCase();
		const hasPartialConfig = settings && settings.imapSettings.host;

		// Accounts that arrived here via the provider's own sign-in flow have
		// already tried OAuth, so there's nothing to redirect them to
		const cameFromOauth = _.some(
			OAUTH_PROVIDERS,
			(provider) => provider.accountType === this.state.accountType,
		);
		const oauthProvider = cameFromOauth ? null : getOauthProviderForSettings(settings);

		const isAuthError = lowerError.includes("auth")
			|| lowerError.includes("login")
			|| lowerError.includes("password")
			|| lowerError.includes("credentials");
		const isConnectionError = lowerError.includes("connect")
			|| lowerError.includes("timeout")
			|| lowerError.includes("network")
			|| lowerError.includes("dial");

		let message = <p>Automatic setup was not able to configure your account.</p>;
		if (oauthProvider) {
			message = (
				<p>
					This looks like a <strong>{oauthProvider.name}</strong> account, and
					{" "}{oauthProvider.name} no longer accepts normal passwords in email
					apps. Sign in with {oauthProvider.name} to continue.{" "}
					<button
						type="button"
						className="manual"
						onClick={() => openLink(oauthProvider.docLink)}
					>Learn more</button>
				</p>
			);
		} else if (isAuthError) {
			message = (
				<p>
					The email or password appears to be incorrect.
					Some providers require an <strong>app-specific password</strong> instead
					of your regular password.{" "}
					<button
						type="button"
						className="manual"
						onClick={() => openLink(SETUP_IMAP_DOC_LINK)}
					>Learn more</button>
				</p>
			);
		} else if (isConnectionError) {
			message = (
				<p>
					Could not connect to the email server.
					Please check your internet connection and try again.
				</p>
			);
		}

		return (
			<div className="account-overlay">
				<div className="account-overlay-content">
					<h3><i className="fa fa-exclamation-triangle" /> Account Setup Problem</h3>

					{message}

					{hasPartialConfig && (
						<p>
							<small>Detected server: {settings.imapSettings.host}:{settings.imapSettings.port}</small>
						</p>
					)}

					{error && <div className="error">{error}</div>}

					<div className="account-control-buttons">
						{oauthProvider ? (
							<button
								className="submit main-button"
								onClick={() => {
									trackEvent("AddAccountErrorOAuth", {
										accountType: oauthProvider.accountType,
									});
									this.setState({
										...getInitialState(),
										accountType: oauthProvider.accountType,
									});
								}}
							>
								<i className="fa fa-sign-in" /> Sign in with {oauthProvider.name}
							</button>
						) : (
							<button
								className="submit main-button"
								onClick={() => {
									trackEvent("AddAccountErrorRetry", { accountType: this.state.accountType });
									this.setState({
										showErrorRecovery: false,
										newAccountSettings: null,
										autoconfigError: "",
									});
								}}
							>
								<i className="fa fa-refresh" /> Try again
							</button>
						)}
						<button
							className="submit"
							onClick={() => {
								trackEvent("AddAccountErrorManual", { accountType: this.state.accountType });
								this.startManualConfig(settings || getEmptyAccountSettings());
							}}
						>
							Configure manually
						</button>
						<button
							className="cancel"
							onClick={() => {
								trackEvent("AddAccountErrorCancel", { accountType: this.state.accountType });
								this.resetState();
							}}
						>
							Cancel
						</button>
					</div>
				</div>
			</div>
		);
	}

	render() {
		if (this.state.showErrorRecovery) {
			return this.renderErrorRecovery();
		}

		if (this.state.manuallyConfiguringAccount) {
			return (
				<div className="account-overlay">
					<div className="account-overlay-content">
						<div className="accounts">
							<AccountForm
								isAddingNewAccount={true}
								itemIndex={0}
								accountSettings={this.state.newAccountSettings || getEmptyAccountSettings()}
								error={this.state.newAccountError}
								deleteItem={this.resetState}
								updateItem={(_, s) => this.completeAddNewAccount(s)}
								closeForm={this.resetState}
							/>
						</div>
					</div>
				</div>
			);
		}

		if (this.state.accountType) {
			const Component = ACCOUNT_TYPE_TO_COMPONENT[this.state.accountType];
			return (
				<Component
					accountType={this.state.accountType}
					closeForm={this.resetState}
					handleAddAccountError={this.handleAddAccountError}
					completeAddNewAccount={this.completeAddNewAccount}
					handleClickManualAddAccount={this.handleClickManualAddAccount}
				/>
			);
		}

		return (
			<form className="account new-account">
				<div className="new-account-buttons">
					<button onClick={_.partial(this.setAccountType, "gmail")}>
						<img src="/providers/gmail.png" /><br />
						Sign in with Google
					</button>
					<button onClick={_.partial(this.setAccountType, "outlook")}>
						<img src="/providers/outlook.png" /><br /> Sign in with Outlook
					</button>
					<button onClick={_.partial(this.setAccountType, "icloud")}>
						<img src="/providers/icloud.png" /><br /> Add iCloud account
					</button>
					<button onClick={_.partial(this.setAccountType, "generic")}>
						<i className="fa fa-envelope" /><br /> Add a different account
					</button>
				</div>
			</form>
		);
	}
}
