package util

import (
	"strconv"
	"strings"
)

func PartIDToString(partID []int) (s string) {
	ids := make([]string, len(partID))
	for i, id := range partID {
		ids[i] = strconv.Itoa(id)
	}
	return strings.Join(ids, ".")
}

func StringToPartID(s string) (partID []int) {
	bits := strings.Split(s, ".")
	partID = make([]int, len(bits))
	for i, bit := range bits {
		partID[i], _ = strconv.Atoi(bit)
	}
	return partID
}
