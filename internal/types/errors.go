package types

import (
	"errors"
	"net"

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
	var operr *net.OpError
	if errors.As(err, &operr) {
		isNetwork = true
	}
	var neterr net.Error
	if errors.As(err, &neterr) {
		isNetwork = true
	}

	if exhttp.IsNetworkError(err) {
		isNetwork = true
	}

	errStack := err
	for errStack != nil {
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
	AccountName   AccountName `json:"accountName"`
}

func WrapAccountError(accountName AccountName, err error) error {
	if err == nil {
		return nil
	}
	error := makeInternalError(err)
	return AccountError{
		InternalError: error,
		AccountName:   accountName,
	}
}

type FolderError struct {
	AccountError `json:",inline"`
	FolderName   FolderName `json:"folderName"`
}

func WrapFolderError(accountName AccountName, folderName FolderName, err error) error {
	if err == nil {
		return nil
	}
	error := makeInternalError(err)
	return FolderError{
		AccountError: AccountError{
			InternalError: error,
			AccountName:   accountName,
		},
		FolderName: folderName,
	}
}
