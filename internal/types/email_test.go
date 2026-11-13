package types

import (
	"testing"

	"github.com/emersion/go-imap/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func singlePart(mediaType, subtype string, size uint32) *imap.BodyStructureSinglePart {
	return &imap.BodyStructureSinglePart{Type: mediaType, Subtype: subtype, Size: size}
}

func attachmentPart(mediaType, subtype, filename string, size uint32) *imap.BodyStructureSinglePart {
	part := singlePart(mediaType, subtype, size)
	part.Extended = &imap.BodyStructureSinglePartExt{
		Disposition: &imap.BodyStructureDisposition{
			Value:  "attachment",
			Params: map[string]string{"filename": filename},
		},
	}
	return part
}

func TestExtractBodyPartsPrefersFirstTextPart(t *testing.T) {
	bs := &imap.BodyStructureMultiPart{
		Subtype: "mixed",
		Children: []imap.BodyStructure{
			singlePart("text", "plain", 700),
			singlePart("image", "png", 482252),
			singlePart("text", "plain", 6),
			singlePart("image", "png", 499264),
			singlePart("text", "plain", 10),
		},
	}

	parts, textPart, htmlPart, displayPart := ExtractBodyParts(bs)

	assert.Len(t, parts, 5)
	require.NotNil(t, textPart)
	assert.Equal(t, "1", textPart.PartStr)
	assert.Nil(t, htmlPart)
	assert.Equal(t, textPart, displayPart)
}

func TestExtractBodyPartsPrefersFirstHTMLPart(t *testing.T) {
	bs := &imap.BodyStructureMultiPart{
		Subtype: "mixed",
		Children: []imap.BodyStructure{
			&imap.BodyStructureMultiPart{
				Subtype: "alternative",
				Children: []imap.BodyStructure{
					singlePart("text", "plain", 100),
					singlePart("text", "html", 5000),
				},
			},
			singlePart("image", "png", 482252),
			singlePart("text", "html", 20),
		},
	}

	_, textPart, htmlPart, displayPart := ExtractBodyParts(bs)

	require.NotNil(t, textPart)
	assert.Equal(t, "1.1", textPart.PartStr)
	require.NotNil(t, htmlPart)
	assert.Equal(t, "1.2", htmlPart.PartStr)
	assert.Equal(t, htmlPart, displayPart)
}

func TestExtractBodyPartsIgnoresAttachments(t *testing.T) {
	bs := &imap.BodyStructureMultiPart{
		Subtype: "mixed",
		Children: []imap.BodyStructure{
			singlePart("text", "html", 2000),
			attachmentPart("text", "plain", "server.log", 50000),
			attachmentPart("text", "html", "export.html", 9000),
		},
	}

	parts, textPart, htmlPart, displayPart := ExtractBodyParts(bs)

	assert.Len(t, parts, 3)
	assert.Equal(t, "server.log", parts[1].Description)
	assert.Nil(t, textPart)
	require.NotNil(t, htmlPart)
	assert.Equal(t, "1", htmlPart.PartStr)
	assert.Equal(t, htmlPart, displayPart)
}
