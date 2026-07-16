package types

import (
	"time"

	"github.com/emersion/go-imap/v2"
	"github.com/emersion/go-message/mail"

	"github.com/oxygem/kanmail/internal/util"
)

type Address struct {
	Name  string `json:"name"`
	Email string `json:"email"`
}

func (a Address) MailAddress() *mail.Address {
	return &mail.Address{
		Name:    a.Name,
		Address: a.Email,
	}
}

type Addresses []Address

func (ads Addresses) MailAddresses() []*mail.Address {
	mads := make([]*mail.Address, len(ads))
	for i, addr := range ads {
		mads[i] = addr.MailAddress()
	}
	return mads
}

type BodyPart struct {
	PartID      []int  `json:"partID"`
	PartStr     string `json:"partStr"`
	Type        string `json:"type"`
	Encoding    string `json:"encoding"`
	Size        uint32 `json:"size"`
	ContentID   string `json:"contentID"`
	Description string `json:"description"`
}

func NewBodyPartFromStructure(id []int, bs *imap.BodyStructureSinglePart) BodyPart {
	description := bs.Description
	if description == "" {
		if desc, ok := bs.Params["name"]; ok {
			description = desc
		}
	}
	if description == "" && bs.Extended != nil && bs.Extended.Disposition != nil {
		if desc, ok := bs.Extended.Disposition.Params["filename"]; ok {
			description = desc
		}
	}

	return BodyPart{
		PartID:      id,
		PartStr:     util.PartIDToString(id),
		Type:        bs.MediaType(),
		Encoding:    bs.Encoding,
		Size:        bs.Size,
		ContentID:   bs.ID,
		Description: description,
	}
}

// ExtractBodyParts walks an IMAP BodyStructure and produces the flat Parts
// list plus the preferred text, HTML, and display parts. The display heuristic
// picks the text part over HTML when their sizes are within 3x (an email with
// only <p>-wrapped plaintext is treated as plain).
func ExtractBodyParts(bs imap.BodyStructure) (parts []BodyPart, textPart, htmlPart, displayPart *BodyPart) {
	if bs == nil {
		return nil, nil, nil, nil
	}

	bs.Walk(func(path []int, body imap.BodyStructure) bool {
		bstruct, ok := body.(*imap.BodyStructureSinglePart)
		if !ok {
			return true
		}
		bPart := NewBodyPartFromStructure(path, bstruct)
		parts = append(parts, bPart)
		switch body.MediaType() {
		case "text/plain":
			textPart = &bPart
		case "text/html":
			htmlPart = &bPart
		}
		return true
	})

	switch {
	case htmlPart == nil:
		displayPart = textPart
	case textPart == nil:
		displayPart = htmlPart
	case htmlPart.Size < textPart.Size*3:
		displayPart = textPart
	default:
		displayPart = htmlPart
	}
	return
}

type Email struct {
	// Internal meta
	AccountName AccountName `json:"accountName"`

	// Actual folder name, and alias name used by frontend
	FolderName      FolderName `json:"-"`
	FolderAliasName FolderName `json:"folderName"`

	// Email info + content to render preview
	UID     imap.UID    `json:"uid"`
	Flags   []imap.Flag `json:"flags"`
	Size    int64       `json:"size"`
	Date    time.Time   `json:"date"`
	Subject string      `json:"subject"`
	Excerpt string      `json:"excerpt"`

	// Address data
	From    []Address `json:"from"`
	To      []Address `json:"to"`
	Sender  []Address `json:"sender"`
	CC      []Address `json:"cc"`
	BCC     []Address `json:"bcc"`
	ReplyTo []Address `json:"replyTo"`

	// Threading
	MessageID  string   `json:"messageId"`
	References []string `json:"references"`

	// Data meta
	Parts       []BodyPart `json:"parts"`
	PartText    *BodyPart  `json:"partText"`
	PartHTML    *BodyPart  `json:"partHTML"`
	PartDisplay *BodyPart  `json:"partDisplay"`

	// List-Unsubscribe support (one click POST URL if provided in headers)
	ListUnsubscribeURL      string `json:"listUnsubscribeURL"`
	ListUnsubscribeOneclick bool   `json:"listUnsubscribeOneClick"`
}

func (e Email) GetAddresses() []Address {
	addrs := make([]Address, 0, len(e.From)+len(e.To)+len(e.Sender)+len(e.CC)+len(e.BCC)+len(e.ReplyTo))
	for _, as := range [][]Address{e.From, e.To, e.Sender, e.CC, e.BCC, e.ReplyTo} {
		addrs = append(addrs, as...)
	}
	return addrs
}
