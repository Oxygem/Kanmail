package types

type CacheStats struct {
	PageSize              int64
	PageCount             int64
	DatabaseSize          int64
	DatabaseSizeFormatted string
	PageSizeFormatted     string
	FreelistPages         int64
	SchemaVersion         string
	DatabaseFilename      string
}
