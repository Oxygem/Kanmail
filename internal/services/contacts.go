package services

import (
	"context"
	"crypto/md5"
	"encoding/base64"
	"encoding/hex"
	"net/http"
	"net/url"
	"strings"

	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/caches"
	"github.com/oxygem/kanmail/internal/types"
	"github.com/oxygem/kanmail/internal/util"
)

type ContactsService struct {
	log    zerolog.Logger
	caches *caches.Caches
}

func NewContactsService(log zerolog.Logger, caches *caches.Caches) *ContactsService {
	return &ContactsService{
		log:    log.With().Str("component", "contacts").Logger(),
		caches: caches,
	}
}

func (c *ContactsService) AddAlwaysShowImages(ctx context.Context, addr types.Address) error {
	ctx = c.log.With().Str("method", "AddAlwaysShowImages").Logger().WithContext(ctx)
	defer util.LogAndPanic(ctx)
	defer zerolog.Ctx(ctx).Info().Any("address", addr).Msg("Set always show images")
	return c.caches.ContactsCache.SetAlwaysShowImages(ctx, addr, true)
}

func (c *ContactsService) ShouldSenderShowImages(ctx context.Context, addr types.Address) (bool, error) {
	ctx = c.log.With().Str("method", "ShouldSenderShowImages").Logger().WithContext(ctx)
	defer util.LogAndPanic(ctx)
	return c.caches.ContactsCache.GetAlwaysShowImages(ctx, addr)
}

func (c *ContactsService) SearchContacts(ctx context.Context, term string) ([]types.Address, error) {
	ctx = c.log.With().Str("method", "SearchContacts").Str("term", term).Logger().WithContext(ctx)
	defer util.LogAndPanic(ctx)
	return c.caches.ContactsCache.Search(ctx, term)
}

type AvatarResp struct {
	Data        *string `json:"data"`
	ContentType string  `json:"contentType"`
}

func (c *ContactsService) GetAvatar(ctx context.Context, email string) (*AvatarResp, error) {
	ctx = c.log.With().Str("method", "GetAvatar").Str("email", email).Logger().WithContext(ctx)
	defer util.LogAndPanic(ctx)
	log := zerolog.Ctx(ctx)

	if exists, data, contentType, err := c.caches.AvatarCache.Get(ctx, email); err != nil {
		log.Err(err).Msg("Failed to check avatar cached")
	} else if exists {
		log.Debug().Int("size", len(data)).Msg("Got avatar from cache")
		dataStr := base64.RawStdEncoding.EncodeToString(data)
		return &AvatarResp{
			Data:        &dataStr,
			ContentType: contentType,
		}, nil
	}

	hash := md5.Sum([]byte(email))
	emailHash := hex.EncodeToString(hash[:])

	reqs := []*util.HTTPRequest{{
		Method: http.MethodGet,
		URL:    "https://www.gravatar.com/avatar/" + emailHash,
		Query:  url.Values{"d": []string{"404"}},
	}}

	if _, domain, ok := strings.Cut(email, "@"); ok {
		reqs = append(reqs, &util.HTTPRequest{
			Method: http.MethodGet,
			URL:    "https://icons.duckduckgo.com/ip3/" + domain + ".ico",
		})
	}

	var avatar *AvatarResp
	var data []byte
	for _, req := range reqs {
		resp, d, err := util.MakeHTTPRequest(ctx, http.DefaultClient, req)
		if err != nil {
			log.Warn().Err(err).Str("url", req.URL).Msg("Failed to load icon from url")
			continue
		}
		data = d
		dataStr := base64.RawStdEncoding.EncodeToString(d)
		avatar = &AvatarResp{
			Data:        &dataStr,
			ContentType: resp.Header.Get("Content-Type"),
		}
		log.Debug().Str("url", req.URL).Msg("Got avatar from url")
		break
	}

	// Note: intentionally caching nil here
	var contentType string
	if avatar != nil {
		contentType = avatar.ContentType
	}
	if err := c.caches.AvatarCache.Store(ctx, email, data, contentType); err != nil {
		log.Err(err).Msg("Failed to cache avatar")
	}

	return avatar, nil
}
