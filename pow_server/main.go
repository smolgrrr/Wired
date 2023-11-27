package main

import (
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"math/bits"
	"net/http"
	"runtime"
	"strconv"
	"time"

	"github.com/nbd-wtf/go-nostr"
)

var (
	ErrDifficultyTooLow = errors.New("nip13: insufficient difficulty")
	ErrGenerateTimeout  = errors.New("nip13: generating proof of work took too long")
)

// Difficulty counts the number of leading zero bits in an event ID.
// It returns a negative number if the event ID is malformed.
func Difficulty(eventID string) int {
	if len(eventID) != 64 {
		return -1
	}
	var zeros int
	for i := 0; i < 64; i += 2 {
		if eventID[i:i+2] == "00" {
			zeros += 8
			continue
		}
		var b [1]byte
		if _, err := hex.Decode(b[:], []byte{eventID[i], eventID[i+1]}); err != nil {
			return -1
		}
		zeros += bits.LeadingZeros8(b[0])
		break
	}
	return zeros
}

// Generate performs proof of work on the specified event until either the target
// difficulty is reached or the function runs for longer than the timeout.
// The latter case results in ErrGenerateTimeout.
//
// Upon success, the returned event always contains a "nonce" tag with the target difficulty
// commitment, and an updated event.CreatedAt.
func Generate(event *nostr.Event, targetDifficulty int, nonceStart int, nonceStep int) (*nostr.Event, error) {
	nonce := nonceStart
	tag := nostr.Tag{"nonce", strconv.Itoa(nonceStep), strconv.Itoa(targetDifficulty)}
	event.Tags = append(event.Tags, tag)

	for {
		nonce += nonceStep
		tag[1] = strconv.Itoa(nonce)
		event.CreatedAt = nostr.Now()
		if Difficulty(event.GetID()) >= targetDifficulty {
			return event, nil
		}
	}
}

func generatePOW(event *nostr.Event, difficulty int, numCores int) (*nostr.Event, error) {
	resultChan := make(chan *nostr.Event)
	errorChan := make(chan error)

	for i := 0; i < numCores; i++ {
		go func(nonceStart int, nonceStep int) {
			generatedEvent, err := Generate(event, difficulty, nonceStart, nonceStep)
			if err != nil {
				errorChan <- err
				return
			}
			resultChan <- generatedEvent
		}(i, numCores)
	}

	select {
	case result := <-resultChan:
		return result, nil
	case err := <-errorChan:
		return nil, err
	}
}

// PowRequest struct for the POST request
type PowRequest struct {
	ReqEvent   *nostr.Event `json:"req_event"`
	Difficulty string       `json:"difficulty"`
}

// handlePOW is the handler function for the "/powgen" endpoint
func handlePOW(w http.ResponseWriter, r *http.Request, numCores int) {
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
	generatedEvent, err := generatePOW(powReq.ReqEvent, difficulty, numCores)
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
func handleTest(w http.ResponseWriter, r *http.Request, numCores int) {
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
	pow, err := generatePOW(event, difficulty, numCores)
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

func handlePOWWithCores(numCores int) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		handlePOW(w, r, numCores)
	}
}

func handleTestWithCores(numCores int) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		handleTest(w, r, numCores)
	}
}

func main() {
	numCores := runtime.NumCPU()

	http.Handle("/powgen", corsMiddleware(handlePOWWithCores(numCores)))
	http.Handle("/test", corsMiddleware(handleTestWithCores(numCores)))

	log.Fatal(http.ListenAndServe("0.0.0.0:42068", nil))
}
