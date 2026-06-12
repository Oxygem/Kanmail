package emails

import (
	"time"

	"github.com/emersion/go-imap/v2"

	"github.com/oxygem/kanmail/internal/types"
)

type PaginateOptions struct {
	Reset     bool `json:"reset"`
	BatchSize int  `json:"batchSize"`
}

type PaginateRespMeta struct {
	Count int `json:"count"`
	// Date of the oldest email sent to the frontend, ie how far back in time
	// pagination has reached for this account folder
	LastSentDate time.Time `json:"lastSentDate"`
	// True when there are no more emails to paginate
	Exhausted bool `json:"exhausted"`
}

type PaginateResp struct {
	Emails []*types.Email   `json:"emails"`
	Meta   PaginateRespMeta `json:"meta"`
}

type SyncResp struct {
	PaginateResp
	DeletedUIDs []imap.UID `json:"deletedUids"`
	ReadUIDs    []imap.UID `json:"readUids"`
	UnreadUIDs  []imap.UID `json:"unreadUids"`
}

type FetchEmailPartsOptions struct {
	peek    bool
	partial *imap.SectionPartial
}

type fetchPartsResp map[imap.UID]bodyPartResp
type bodyPartResp struct {
	types.BodyPart
	Bytes []byte `json:"-"`
}

type FetchPartsMap map[imap.UID]types.BodyPart
type FetchPartsResp map[imap.UID]*BodyPartResp

type BodyPartResp struct {
	bodyPartResp
	Data    string `json:"data"`
	Trusted bool   `json:"trusted"`
}
