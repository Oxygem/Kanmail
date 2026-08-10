package caches

func makeInSQL(values []string) (string, []any) {
	if len(values) == 0 {
		return "NULL", nil
	}
	var query string
	args := make([]any, len(values))
	for i, msgid := range values {
		if i > 0 {
			query += ","
		}
		query += "?"
		args[i] = msgid
	}
	return query, args
}
