package services

import (
	"crypto/sha1"
	"encoding/base32"
	"encoding/hex"
	"io/fs"
	"os"

	"github.com/rs/zerolog"
	"go.mau.fi/util/random"
)

const deviceIDLength = 16

func generateDeviceID() string {
	return base32.HexEncoding.WithPadding(base32.NoPadding).EncodeToString(random.Bytes(deviceIDLength / 1.6))
}

func hashLicenseKey(key string) string {
	hasher := sha1.New()
	hasher.Write([]byte(key))
	return hex.EncodeToString(hasher.Sum(nil))
}

func ensureDeviceIDFile(log zerolog.Logger, filename string) string {
	b, _ := os.ReadFile(filename)
	if b != nil {
		log.Info().Str("device_id", string(b)).Msg("Read device ID from file")
		// TODO: validate device ID!
		return string(b)
	}

	d := generateDeviceID()
	if err := os.WriteFile(filename, []byte(d), fs.ModePerm); err != nil {
		log.Err(err).Msg("Failed to write deviceID file")
	}

	log.Info().Str("device_id", d).Msg("Wrote device ID to file")
	return d
}
