import _ from "lodash";
import PropTypes from "prop-types";
import React from "react";

import { APPLE_APP_PASSWORD_LINK } from "../../constants.ts";
import { openLink } from "../../window.ts";
// import gmailLogo from "images/providers/gmail.png";
// import icloudLogo from "images/providers/icloud.png";
// import outlookLogo from "images/providers/outlook.png";
// import yahooLogo from "images/providers/yahoo.png";
import { AccountsService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import {
	AccountSettings,
	Address,
} from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import AccountForm from "./AccountForm.tsx";

interface GenericAccountFormProps {
	closeForm: (any) => void;
	handleAddAccountError: (any) => void;
	completeAddNewAccount: (any) => void;
	handleClickManualAddAccount: (any) => void;
}

interface GenericAccountFormState {
	newAccountError: null | React.ReactNode | string;
	newAccountUsername: string;
	newAccountPassword: string;

	newAccountSettings: AccountSettings | null;
	newAccountName: string;
	newAccountAddressEmail: string;
	newAccountAddressName: string;

	isLoadingNewAccount: boolean;

	oauthError: string | null;
	oauthRequestId: string | null;
}

class GenericAccountForm extends React.Component<
	GenericAccountFormProps,
	GenericAccountFormState
> {
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

			oauthError: null,
			oauthRequestId: null,
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
				newAccountSettings: data,
			});

			return;
		};

		const handleError = (error: any) => {
			this.props.handleAddAccountError(error.message);
		}
		this.setState({ isLoadingNewAccount: true });

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
			Automatically setup an account using username and email.
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
			<div>
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
					<label htmlFor="account-name">
						Account display name (eg Work, Personal)
					</label>
					<input
						id="account-name"
						value={this.state.newAccountName}
						onChange={_.partial(this.handleUpdate, "newAccountName")}
					/>
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
						{/* @ts-ignore */}
						<div className="notice error">{this.state.newAccountError}</div>
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
		this.oauthRequestCheck = setInterval(this.checkForOauthRequest, 1000);
	}

	componentDidMount() {
		AccountsService.StartOAuthRequest(this.getOauthProvider()).then(v => {
			this.setState({ oauthRequestId: v });
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

			const data = {
				domain: this.getAutoconfDomain(),
				oauthRefreshToken: resp.refreshToken,
				oauthProvider: this.getOauthProvider(),
			};

			AccountsService.AutoconfigureNewAccount(resp.email, data).then(settings => {
				this.setState({
					newAccountAddressEmail: resp.email,
					newAccountSettings: settings,
				});
			}).catch(e => {
				// TODO

				console.log(e);

				// if did autoconf:
				this.setState({
					newAccountError: "Authentication failed!",
					isLoadingNewAccount: false,
				});

				this.props.handleAddAccountError(e)
			})

			this.setState({ isLoadingNewAccount: true });
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
		return (
			<div className="account-control-buttons">
				<span>Waiting for confirmation!</span>
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
				</a>{" "}
				for any non-Apple email access.
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
	newAccountErrorType: null,

	// Add account phase 2 - manual config if auto fails
	isLoadingNewAccount: false,
	manuallyConfiguringAccount: false,
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
	newAccountErrorType: null | string;

	accountType: string;

	isLoadingNewAccount: boolean;
	manuallyConfiguringAccount: boolean;

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

	handleAddAccountError = (error: string) => {
		let newAccountSettings = getEmptyAccountSettings();
		this.setState({
			isLoadingNewAccount: false,
			manuallyConfiguringAccount: true,
			newAccountSettings,
			newAccountError: error,
			// newAccountErrorType: data.errorName,
		});
	};

	handleClickManualAddAccount = (ev) => {
		this.setState({
			isLoadingNewAccount: false,
			manuallyConfiguringAccount: true,
			newAccountSettings: getEmptyAccountSettings(),
		});
	};

	completeAddNewAccount = (accountSettings) => {
		this.props.addItem(accountSettings);
		this.resetState();
	};

	setAccountType = (accountType) => {
		this.setState({ accountType });
	};

	render() {
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
								errorType={this.state.newAccountErrorType}
								deleteItem={this.resetState}
								updateItem={this.completeAddNewAccount}
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
