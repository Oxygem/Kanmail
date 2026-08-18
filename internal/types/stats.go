package types

type CacheStats struct {
	// Storage
	PageSize        int64
	PageCount       int64
	LogicalSize     int64
	FreelistPages   int64
	FreelistSize    int64
	FreelistPercent float64
	MaxPageCount    int64
	MaxSize         int64
	FileSize        int64
	WALSize         int64
	SHMSize         int64
	TotalOnDiskSize int64

	// Configuration
	JournalMode       string
	Synchronous       string
	AutoVacuum        string
	Encoding          string
	ForeignKeys       bool
	BusyTimeout       int64
	CacheSize         int64
	WALAutocheckpoint int64
	TempStore         string
	LockingMode       string
	CachesDisabled    bool

	// Versions & schema
	SQLiteVersion   string
	SchemaVersion   int64
	UserVersion     int64
	ApplicationID   int64
	MigrationCount  int64
	LatestMigration string
	UpgradeCount    int64
	LatestUpgrade   string
	TableCount      int64
	IndexCount      int64
	TriggerCount    int64
	ViewCount       int64

	DatabaseFilename string
}

type CacheIntegrityResult struct {
	OK         bool
	Messages   []string
	DurationMS int64
}
