package types

import (
	"context"
	"errors"
	"io"

	"github.com/rs/zerolog"
	"go.mau.fi/util/exhttp"
)

type InternalError struct {
	Err       error `json:"error"`
	IsNetwork bool  `json:"isNetwork"`
}

func (e InternalError) Error() string {
	return e.Err.Error()
}

func makeInternalError(err error) InternalError {
	isNetwork := false

	if exhttp.IsNetworkError(err) || errors.Is(err, io.ErrUnexpectedEOF) {
		isNetwork = true
	}

	errStack := err
	for errStack != nil {
		zerolog.Ctx(context.TODO()).Trace().Err(errStack).Msg("Unwrapped error stack")
		errStack = errors.Unwrap(errStack)
	}

	return InternalError{
		Err:       err,
		IsNetwork: isNetwork,
	}
}

func WrapError(err error) error {
	if err == nil {
		return nil
	}
	return makeInternalError(err)
}

type AccountError struct {
	InternalError `json:",inline"`
	AccountID     AccountID `json:"accountID"`
}

func WrapAccountError(accountID AccountID, err error) error {
	if err == nil {
		return nil
	}
	error := makeInternalError(err)
	return AccountError{
		InternalError: error,
		AccountID:     accountID,
	}
}

type FolderError struct {
	AccountError `json:",inline"`
	FolderName   FolderName `json:"folderName"`
}

func WrapFolderError(accountID AccountID, folderName FolderName, err error) error {
	if err == nil {
		return nil
	}
	error := makeInternalError(err)
	return FolderError{
		AccountError: AccountError{
			InternalError: error,
			AccountID:     accountID,
		},
		FolderName: folderName,
	}
}

type AccountSettingsError struct {
	InternalError `json:",inline"`
	Settings      AccountSettings `json:"settings"`
}

func WrapAccountSettingsError(settings AccountSettings, err error) error {
	if err == nil {
		return nil
	}
	return AccountSettingsError{
		InternalError: makeInternalError(err),
		Settings:      settings,
	}
}
