package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/nbd-wtf/go-nostr"
	"github.com/nbd-wtf/go-nostr/nip13"
)

// EventContent struct for request body
type EventContent struct {
	Content string `json:"content"`
	Pubkey  string `json:"pubkey"`
}

// PowRequest struct for the POST request
type PowRequest struct {
	ReqEvent   EventContent `json:"req_event"`
	Difficulty string       `json:"difficulty"`
}

// handlePOW is the handler function for the "/powgen" endpoint
func handlePOW(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Invalid request method", http.StatusMethodNotAllowed)
		return
	}

	var powReq PowRequest
	err := json.NewDecoder(r.Body).Decode(&powReq)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	difficulty, err := strconv.Atoi(powReq.Difficulty)
	if err != nil {
		// handle error
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Create a nostr Event
	unsignedEvent := &nostr.Event{
		Kind:      nostr.KindTextNote,
		CreatedAt: nostr.Now(),
		Content:   powReq.ReqEvent.Content,
		PubKey:    powReq.ReqEvent.Pubkey,
	}

	// Start the timer
	start := time.Now()

	// Generate proof of work for the event
	generatedEvent, err := nip13.Generate(unsignedEvent, difficulty, 3*time.Hour)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Calculate the duration in milliseconds
	iterations, _ := strconv.ParseFloat(generatedEvent.Tags[0][1], 64)
	hashrate := iterations / time.Since(start).Seconds()

	// Create a response struct
	type Response struct {
		Event    *nostr.Event `json:"event"`
		Hashrate float64      `json:"hashrate"`
	}

	// Respond with the generated event and the time taken
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(Response{Event: generatedEvent, Hashrate: hashrate})
}

func main() {
	http.HandleFunc("/powgen", handlePOW)

	log.Fatal(http.ListenAndServe("127.0.0.1:8080", nil))
}
