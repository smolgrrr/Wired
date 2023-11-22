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

// PowRequest struct for the POST request
type PowRequest struct {
	ReqEvent   *nostr.Event `json:"req_event"`
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

	// Generate proof of work for the event
	generatedEvent, err := nip13.Generate(powReq.ReqEvent, difficulty, 3*time.Hour)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Create a response struct
	type Response struct {
		Event *nostr.Event `json:"event"`
	}

	// Respond with the generated event and the time taken
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(Response{Event: generatedEvent})
}

// PowRequest struct for the POST request
type TestRequest struct {
	Difficulty string `json:"difficulty"`
}

// handlePOW is the handler function for the "/powgen" endpoint
func handleTest(w http.ResponseWriter, r *http.Request) {
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

	// Start the timer
	start := time.Now()

	event := &nostr.Event{
		Kind:    nostr.KindTextNote,
		Content: "It's just me mining my own business",
		PubKey:  "a48380f4cfcc1ad5378294fcac36439770f9c878dd880ffa94bb74ea54a6f243",
	}
	pow, err := nip13.Generate(event, difficulty, 3*time.Hour)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Calculate the duration in milliseconds
	iterations, _ := strconv.ParseFloat(pow.Tags[0][1], 64)
	timeTaken := time.Since(start).Seconds()
	hashrate := iterations / time.Since(start).Seconds()

	// Create a response struct
	type Response struct {
		TimeTaken float64 `json:"timeTaken"`
		Hashrate  float64 `json:"hashrate"`
	}

	// Respond with the generated event and the time taken
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(Response{TimeTaken: timeTaken, Hashrate: hashrate})
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Set headers
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")

		// If it's a preflight request, respond with 200
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		// Next
		next.ServeHTTP(w, r)
	})
}

func main() {
	http.Handle("/powgen", corsMiddleware(http.HandlerFunc(handlePOW)))
	http.Handle("/test", corsMiddleware(http.HandlerFunc(handleTest)))

	log.Fatal(http.ListenAndServe("0.0.0.0:42068", nil))
}
