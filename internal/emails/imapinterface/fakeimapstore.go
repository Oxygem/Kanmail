package imapinterface

import (
	"fmt"
	"math/rand"
	"strings"
	"time"

	"github.com/brianvoe/gofakeit/v7"
	"github.com/emersion/go-imap/v2"
	"go.mau.fi/util/exsync"

	"github.com/oxygem/kanmail/internal/constants"
)

type fakeFolderData struct {
	name        string
	uidValidity uint32
	uidNext     imap.UID
	exists      uint32
	recent      uint32
	messages    *exsync.Map[imap.UID, *fakeMessage]
}

type fakeMessage struct {
	uid      imap.UID
	flags    []imap.Flag
	size     uint32
	envelope *imap.Envelope
	date     time.Time
	content  string
}

type fakeIMAPStore struct {
	folders      *exsync.Map[string, *fakeFolderData]
	fakeThreads  [][]fakeEmail
	localAddress imap.Address
}

var fakeStore fakeIMAPStore

func init() {
	fakeIMAPEnv := constants.ENV_DEBUG_FAKE_IMAP

	if fakeIMAPEnv != "" {
		var fThreads [][]fakeEmail = fakeThreads
		if fakeIMAPEnv == "support" {
			fThreads = fakeSupportTicketThreads
		} else if fakeIMAPEnv == "sales" {
			fThreads = fakeSalesExecutiveThreads
		}

		// If we're going to use fake imap, initialize the global store
		fakeStore = fakeIMAPStore{
			folders:      exsync.NewMap[string, *fakeFolderData](),
			fakeThreads:  fThreads,
			localAddress: makeIMAPAddress(),
		}
		fakeStore.createAllFoldersFromThreads()
	}
}

func (s *fakeIMAPStore) createFolderData(folderName string) {
	// Create new folder structure
	folderData := &fakeFolderData{
		name:        folderName,
		uidValidity: 1234567890,
		uidNext:     1,
		exists:      0,
		recent:      0,
		messages:    exsync.NewMap[imap.UID, *fakeMessage](),
	}

	// Get all existing folders to choose from
	existingFolders := s.folders.CopyData()
	if len(existingFolders) == 0 {
		// No existing folders, create empty folder
		s.folders.Set(folderName, folderData)
		return
	}

	// Pick a random existing folder
	folderNames := []string{"inbox", "archive", "trash"}
	randomFolderName := folderNames[rand.Intn(len(folderNames))]
	sourceFolder := existingFolders[randomFolderName]

	// Get all messages from the source folder
	sourceMessages := sourceFolder.messages.CopyData()
	if len(sourceMessages) == 0 {
		panic("inbox is empty")
	}

	// Pick a small percentage (10-20%) of random messages from source folder
	numMessages := len(sourceMessages)
	copyCount := max(1, numMessages/3+rand.Intn(max(1, numMessages/2))) // 10-20% of messages, minimum 1

	// Get all UIDs from source messages
	sourceUIDs := make([]imap.UID, 0, numMessages)
	for uid := range sourceMessages {
		sourceUIDs = append(sourceUIDs, uid)
	}

	// Shuffle and pick random messages
	rand.Shuffle(len(sourceUIDs), func(i, j int) { sourceUIDs[i], sourceUIDs[j] = sourceUIDs[j], sourceUIDs[i] })
	copyCount = min(copyCount, len(sourceUIDs))

	var newUID imap.UID = 1
	for i := 0; i < copyCount; i++ {
		sourceUID := sourceUIDs[i]
		sourceMsg := sourceMessages[sourceUID]

		// Update the UID and add to new folder
		sourceMsg.uid = newUID
		folderData.messages.Set(newUID, sourceMsg)
		folderData.exists++
		newUID++
	}

	folderData.uidNext = newUID
	s.folders.Set(folderName, folderData)
}

// createAllFoldersFromThreads uses the realistic fake email threads to populate all folders
// Each email in a thread is distributed across different folders to simulate conversation flow
func (s *fakeIMAPStore) createAllFoldersFromThreads() {
	// Create standard folders
	folders := []string{"inbox", "sent", "drafts", "archive", "trash"}
	folderData := make(map[string]*fakeFolderData)

	for _, folderName := range folders {
		folderData[folderName] = &fakeFolderData{
			name:        folderName,
			uidValidity: 1234567890,
			uidNext:     1,
			exists:      0,
			recent:      0,
			messages:    exsync.NewMap[imap.UID, *fakeMessage](),
		}
	}

	var uidCounter imap.UID = 1

	// Process each thread
	for threadIdx, thread := range s.fakeThreads {
		// Pattern for distributing emails in thread across folders
		// Most threads follow inbox -> Sent -> inbox pattern for conversations
		folderPattern := []string{"inbox", "sent", "inbox", "sent", "inbox"}

		// Some threads have different patterns
		switch threadIdx % 4 {
		case 0:
			// Normal conversation: inbox -> Sent -> inbox
			folderPattern = []string{"inbox", "sent", "inbox", "sent", "inbox"}
		case 1:
			// Draft scenario: some emails in drafts
			if len(thread) == 1 {
				folderPattern = []string{"drafts"}
			} else {
				folderPattern = []string{"inbox", "drafts", "sent", "inbox"}
			}
		case 2:
			// Trashed thread w/later replies
			folderPattern = []string{"trash", "inbox", "sent", "inbox"}
		case 3:
			// Archive scenario: older conversation
			folderPattern = []string{"archive", "sent", "archive"}
		}

		// Track message IDs for InReplyTo references
		var threadMessageIDs []string

		// Generate messages from thread
		for emailIdx, email := range thread {
			messageID := fmt.Sprintf("<thread%d.email%d@kanmail>", threadIdx, emailIdx)
			threadMessageIDs = append(threadMessageIDs, messageID)

			targetFolder := folderPattern[emailIdx%len(folderPattern)]
			folder := folderData[targetFolder]

			uid := uidCounter
			uidCounter++

			// Create realistic sender names and addresses
			var from, to []imap.Address

			if targetFolder == "sent" || targetFolder == "drafts" {
				// For sent items and drafts, we are the sender
				from = []imap.Address{s.localAddress}
				to = []imap.Address{makeIMAPAddress()}
			} else {
				from = []imap.Address{makeIMAPAddress()}
				to = []imap.Address{s.localAddress}
			}

			// Calculate message date (spread over last 30 days, with thread emails closer together)
			baseDaysAgo := (threadIdx * 3) + len(thread)
			emailDaysAgo := baseDaysAgo - emailIdx
			msgDate := time.Now().AddDate(0, 0, -emailDaysAgo)

			// Create envelope with InReplyTo for reply messages
			envelope := &imap.Envelope{
				Subject:   email.subject,
				MessageID: messageID,
				From:      from,
				To:        to,
				Date:      msgDate,
			}

			// Set InReplyTo for replies (any email after the first in a thread)
			if emailIdx > 0 {
				envelope.InReplyTo = []string{threadMessageIDs[emailIdx-1]} // Reply to previous message
			}

			msg := &fakeMessage{
				uid:      uid,
				flags:    []imap.Flag{},
				size:     uint32(len(email.content) + len(email.subject) + 500),
				date:     msgDate,
				envelope: envelope,
				content:  email.content,
			}

			// Set flags based on folder and message characteristics
			switch targetFolder {
			case "drafts":
				msg.flags = append(msg.flags, imap.FlagDraft)
			case "sent":
				msg.flags = append(msg.flags, imap.FlagSeen) // Sent items are always seen
			default:
				// Mark some messages as read (older ones more likely)
				if emailDaysAgo > 7 || rand.Intn(3) == 0 {
					msg.flags = append(msg.flags, imap.FlagSeen)
				}

				// Mark some recent messages as recent
				if emailDaysAgo < 2 && folder.recent < 3 {
					msg.flags = append(msg.flags, "\\Recent")
					folder.recent++
				}

				// Mark some messages as answered (if they're part of a thread with replies)
				if len(thread) > emailIdx+1 {
					msg.flags = append(msg.flags, imap.FlagAnswered)
				}
			}

			folder.messages.Set(uid, msg)
			folder.exists++
		}
	}

	// Update uidNext for all folders and store them
	for _, folder := range folderData {
		folder.uidNext = uidCounter
		s.folders.Set(folder.name, folder)
	}
}

func makeIMAPAddress() imap.Address {
	name := gofakeit.Name()
	nameParts := strings.SplitN(name, " ", 2)
	username := strings.ToLower(nameParts[0]) + strings.ToLower(nameParts[1])
	domain := companyDomains[rand.Intn(len(companyDomains))]
	return imap.Address{
		Name:    name,
		Mailbox: username,
		Host:    domain,
	}
}
