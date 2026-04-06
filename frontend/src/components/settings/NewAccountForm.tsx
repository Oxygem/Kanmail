import _ from "lodash";
import React from "react";

import { AccountsService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { OAuthRequest } from "../../../bindings/github.com/oxygem/kanmail/internal/services/models.ts";
import { AccountSettings, Address } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import ColorPicker from "../../components/ColorPicker.tsx";
import { ACCOUNT_ACCENT_COLORS, APPLE_APP_PASSWORD_LINK } from "../../constants.ts";
import { trackEvent } from "../../util/analytics.ts";
import { normalizeError } from "../../util/error.ts";
import settingsStore from "../../stores/settings.ts";
import { getNextAccentColor } from "../../util/accounts.ts";
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

interface GenericAccountFormProps {
	accountType: string;
	closeForm: () => void;
	handleAddAccountError: (s: AccountSettings, e: Error) => void;
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
								onClick={() =>
									openLink("https://kanmail.io/docs/email-providers")
								}
							>
								<strong>our help page for more information</strong>.
							</button>
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
				settings = error.cause.settings as AccountSettings;
			}
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
	oauthRequestCheck: NodeJS.Timeout

	constructor(props) {
		super(props);
		this.oauthRequestCheck = setInterval(this.checkForOauthRequest, 100);
	}

	componentDidMount() {
		AccountsService.StartOAuthRequest(this.getOauthProvider()).then((v: OAuthRequest) => {
			this.setState({
				oauthRequestId: v.uid,
				oauthRequestUrl: v.url,
			});
			trackEvent("AddAccountOAuthStarted", { accountType: this.props.accountType });
		})
	}

	componentWillUnmount() {
		clearInterval(this.oauthRequestCheck);
	}

	checkForOauthRequest = () => {
		if (!this.state.oauthRequestId) {
			return;
		}

		AccountsService.GetOAuthResponse(this.state.oauthRequestId).then((resp) => {
			if (!resp) {
				return
			}
			clearInterval(this.oauthRequestCheck);
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
					settings = e.cause.settings as AccountSettings;
				}

				this.props.handleAddAccountError(settings, e.message);
			})
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
		let text = <p>Waiting for confirmation!</p>;
		if (this.state.isLoadingNewAccount) {
			text = <p><i className="fa fa-refresh fa-spin" /> Setting up account...</p>
		}
		return (
			<div className="account-control-buttons">
				{this.state.isLoadingNewAccount ?
					<p><i className="fa fa-refresh fa-spin" /> Setting up account...</p>
					: <>
						<p>Waiting for confirmation!</p>
						<p>Nothing happening or not working? Try opening this URL in your web browser:</p>
						<pre className="wrap">{this.state.oauthRequestUrl}</pre>
					</>
				}
				<button className="cancel" onClick={this.props.closeForm}>
					Cancel
				</button>
			</div>
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
	newAccountName: "",
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
	newAccountName: string;
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
			error: error, // should be generic/non-PII
			domain: imapUsernameBits[imapUsernameBits.length - 1], // domain only, no PII
		});
	};

	handleClickManualAddAccount = (ev) => {
		this.setState({
			isLoadingNewAccount: false,
			manuallyConfiguringAccount: true,
			newAccountSettings: getEmptyAccountSettings(),
		});
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
		const error = this.state.autoconfigError.toLowerCase();
		const hasPartialConfig = settings && settings.imapSettings.host;

		const isAuthError = error.includes("auth")
			|| error.includes("login")
			|| error.includes("password")
			|| error.includes("credentials");
		const isConnectionError = error.includes("connect")
			|| error.includes("timeout")
			|| error.includes("network")
			|| error.includes("dial");

		return (
			<div className="account-overlay">
				<div className="account-overlay-content">
					<h3><i className="fa fa-exclamation-triangle" /> Account Setup Problem</h3>

					{isAuthError && (
						<p>
							The email or password appears to be incorrect.
							Some providers require an <strong>app-specific password</strong> instead
							of your regular password.{" "}
							<button
								type="button"
								className="manual"
								onClick={() => openLink("https://kanmail.io/docs/email-providers")}
							>Learn more</button>
						</p>
					)}

					{isConnectionError && (
						<p>
							Could not connect to the email server.
							Please check your internet connection and try again.
						</p>
					)}

					{!isAuthError && !isConnectionError && (
						<p>
							Automatic setup was not able to configure your account.
						</p>
					)}

					{hasPartialConfig && (
						<p>
							<small>Detected server: {settings.imapSettings.host}:{settings.imapSettings.port}</small>
						</p>
					)}

					<div className="account-control-buttons">
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
						<button
							className="submit"
							onClick={() => {
								trackEvent("AddAccountErrorManual", { accountType: this.state.accountType });
								this.setState({
									showErrorRecovery: false,
									manuallyConfiguringAccount: true,
									newAccountError: this.state.autoconfigError,
								});
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
			const { newAccountSettings } = this.state;
			newAccountSettings!.name = this.state.newAccountName;

			return (
				<div className="account-overlay">
					<div className="account-overlay-content">
						<div className="accounts">
							<AccountForm
								key={this.state.newAccountName}
								isAddingNewAccount={true}
								itemIndex={0}
								accountSettings={newAccountSettings || new AccountSettings()}
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
