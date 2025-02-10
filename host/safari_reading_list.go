package main

import (
	"bufio"
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
	"unsafe"

	"howett.net/plist"
)

var logFile *os.File
var nativeEndian binary.ByteOrder
var bufferSize = 8192
const maxMessageSize = 1024 * 1024 // Maximum message size (1MB)

func init() {
	// Determine native byte order
	var one int16 = 1
	b := (*byte)(unsafe.Pointer(&one))
	if *b == 0 {
		nativeEndian = binary.BigEndian
	} else {
		nativeEndian = binary.LittleEndian
	}
}

func initLogFile() error {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return err
	}

	logPath := filepath.Join(homeDir, "Desktop", "safari_reading_list.log")
	f, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	logFile = f
	return nil
}

func writeToLog(message string) {
	if logFile != nil {
		timestamp := time.Now().Format("2006-01-02 15:04:05")
		fmt.Fprintf(logFile, "[%s] %s\n", timestamp, message)
	}
}

func getMessage() (map[string]interface{}, error) {
	reader := bufio.NewReaderSize(os.Stdin, bufferSize)

	lengthBytes := make([]byte, 4)
	if _, err := io.ReadFull(reader, lengthBytes); err != nil {
		if err == io.EOF {
			return nil, fmt.Errorf("browser disconnected: %v", err)
		}
		return nil, err
	}

	var length uint32
	if err := binary.Read(bytes.NewReader(lengthBytes), nativeEndian, &length); err != nil {
		return nil, err
	}

	// Check message size limit
	if length > maxMessageSize {
		return nil, fmt.Errorf("message size %d exceeds maximum allowed size of %d", length, maxMessageSize)
	}

	message := make([]byte, length)
	if _, err := io.ReadFull(reader, message); err != nil {
		return nil, err
	}

	writeToLog(fmt.Sprintf("Received message: %s", string(message)))

	var result map[string]interface{}
	if err := json.Unmarshal(message, &result); err != nil {
		writeToLog(fmt.Sprintf("Error unmarshaling message: %v", err))
		return nil, err
	}

	return result, nil
}

func sendMessage(message interface{}) error {
	jsonData, err := json.Marshal(message)
	if err != nil {
		writeToLog(fmt.Sprintf("Error marshaling message: %v", err))
		return err
	}

	messageLength := len(jsonData) // This correctly counts bytes, not characters
	if messageLength > maxMessageSize {
		return fmt.Errorf("message size %d exceeds maximum allowed size of %d", messageLength, maxMessageSize)
	}

	writeToLog(fmt.Sprintf("Sending message: %s", string(jsonData)))

	// Write length in native byte order
	if err := binary.Write(os.Stdout, nativeEndian, uint32(messageLength)); err != nil {
		return err
	}

	// Write the message
	if _, err := os.Stdout.Write(jsonData); err != nil {
		return err
	}

	return nil
}

func getBookmarksPath() string {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		writeToLog(fmt.Sprintf("Error getting home directory: %v", err))
		return ""
	}
	return filepath.Join(homeDir, "Library/Safari/Bookmarks.plist")
}

func readBookmarks() map[string]interface{} {
	bookmarksPath := getBookmarksPath()
	if bookmarksPath == "" {
		return map[string]interface{}{
			"success": false,
			"error":   "Could not determine bookmarks path",
		}
	}

	bookmarksFile, err := os.Open(bookmarksPath)
	if err != nil {
		return map[string]interface{}{
			"success": false,
			"error":   fmt.Sprintf("Error opening bookmarks file: %v", err),
		}
	}
	defer bookmarksFile.Close()

	var bookmarksData map[string]interface{}
	decoder := plist.NewDecoder(bookmarksFile)
	err = decoder.Decode(&bookmarksData)
	if err != nil {
		return map[string]interface{}{
			"success": false,
			"error":   fmt.Sprintf("Error decoding plist: %v", err),
		}
	}

	return map[string]interface{}{
		"success": true,
		"data":    bookmarksData,
	}
}

func deleteBookmark(url string) map[string]interface{} {
	bookmarksPath := getBookmarksPath()
	if bookmarksPath == "" {
		writeToLog(fmt.Sprintf("Error: Could not determine bookmarks path"))
		return map[string]interface{}{
			"success": false,
			"error":   "Could not determine bookmarks path",
		}
	}

	writeToLog(fmt.Sprintf("Attempting to delete bookmark with URL: %s", url))
	writeToLog(fmt.Sprintf("Bookmarks path: %s", bookmarksPath))

	// Read the current bookmarks file
	bookmarksFile, err := os.Open(bookmarksPath)
	if err != nil {
		writeToLog(fmt.Sprintf("Error opening bookmarks file: %v", err))
		return map[string]interface{}{
			"success": false,
			"error":   fmt.Sprintf("Error opening bookmarks file: %v", err),
		}
	}

	var bookmarksData map[string]interface{}
	decoder := plist.NewDecoder(bookmarksFile)
	err = decoder.Decode(&bookmarksData)
	bookmarksFile.Close() // Close the file after reading

	if err != nil {
		writeToLog(fmt.Sprintf("Error decoding plist: %v", err))
		return map[string]interface{}{
			"success": false,
			"error":   fmt.Sprintf("Error decoding plist: %v", err),
		}
	}

	// Find and remove the bookmark with the specified URL
	modified := false
	if children, ok := bookmarksData["Children"].([]interface{}); ok {
		writeToLog(fmt.Sprintf("Found %d top-level children", len(children)))
		for i, child := range children {
			if childMap, ok := child.(map[string]interface{}); ok {
				if childMap["Title"] == "com.apple.ReadingList" {
					writeToLog("Found Reading List")
					if readingListChildren, ok := childMap["Children"].([]interface{}); ok {
						writeToLog(fmt.Sprintf("Reading List has %d items", len(readingListChildren)))
						newChildren := make([]interface{}, 0, len(readingListChildren))
						for _, item := range readingListChildren {
							if itemMap, ok := item.(map[string]interface{}); ok {
								if itemURL, ok := itemMap["URLString"].(string); ok {
									writeToLog(fmt.Sprintf("Checking item with URL: %s", itemURL))
									if itemURL == url {
										// Skip this item (effectively removing it)
										modified = true
										writeToLog(fmt.Sprintf("Removing item with URL: %s", url))
										continue
									}
								}
							}
							newChildren = append(newChildren, item)
						}

						// Update the reading list with the filtered items
						if modified {
							writeToLog(fmt.Sprintf("Updating Reading List with %d items (removed 1)", len(newChildren)))
							childMap["Children"] = newChildren
							children[i] = childMap
							bookmarksData["Children"] = children
						} else {
							writeToLog(fmt.Sprintf("URL not found in reading list: %s", url))
						}
						break
					} else {
						writeToLog("Reading List has no Children array")
					}
				}
			}
		}
	} else {
		writeToLog("No Children array found in bookmarks data")
	}

	if !modified {
		writeToLog(fmt.Sprintf("URL not found in reading list: %s", url))
		return map[string]interface{}{
			"success": false,
			"error":   fmt.Sprintf("URL not found in reading list: %s", url),
		}
	}

	// Create a backup of the original file
	backupPath := bookmarksPath + ".bak"
	if err := os.Rename(bookmarksPath, backupPath); err != nil {
		writeToLog(fmt.Sprintf("Error creating backup: %v", err))
		return map[string]interface{}{
			"success": false,
			"error":   fmt.Sprintf("Error creating backup: %v", err),
		}
	}
	writeToLog(fmt.Sprintf("Created backup at: %s", backupPath))

	// Write the modified data back to the file
	newFile, err := os.Create(bookmarksPath)
	if err != nil {
		// Try to restore from backup if we can't create the new file
		writeToLog(fmt.Sprintf("Error creating new bookmarks file: %v", err))
		os.Rename(backupPath, bookmarksPath)
		return map[string]interface{}{
			"success": false,
			"error":   fmt.Sprintf("Error creating new bookmarks file: %v", err),
		}
	}

	encoder := plist.NewEncoder(newFile)
	err = encoder.Encode(bookmarksData)
	newFile.Close()

	if err != nil {
		// Try to restore from backup if encoding failed
		writeToLog(fmt.Sprintf("Error encoding plist: %v", err))
		os.Rename(backupPath, bookmarksPath)
		return map[string]interface{}{
			"success": false,
			"error":   fmt.Sprintf("Error encoding plist: %v", err),
		}
	}

	// Success - we can remove the backup
	os.Remove(backupPath)
	writeToLog(fmt.Sprintf("Successfully deleted bookmark with URL: %s", url))

	return map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Successfully deleted bookmark with URL: %s", url),
	}
}

func main() {
	if err := initLogFile(); err != nil {
		fmt.Fprintf(os.Stderr, "Error initializing log file: %v\n", err)
		return
	}
	defer logFile.Close()

	for {
		message, err := getMessage()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error reading message: %v\n", err)
			break
		}

		if cmd, ok := message["command"].(string); ok {
			var response map[string]interface{}

			switch cmd {
			case "getBookmarks":
				response = readBookmarks()
			case "deleteBookmark":
				if url, ok := message["url"].(string); ok {
					response = deleteBookmark(url)
				} else {
					response = map[string]interface{}{
						"success": false,
						"error":   "URL parameter is required for deleteBookmark command",
					}
				}
			default:
				response = map[string]interface{}{
					"success": false,
					"error":   fmt.Sprintf("Unknown command: %s", cmd),
				}
			}

			if err := sendMessage(response); err != nil {
				fmt.Fprintf(os.Stderr, "Error sending message: %v\n", err)
				break
			}
		}
	}
}