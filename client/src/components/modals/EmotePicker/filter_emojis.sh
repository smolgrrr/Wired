#!/bin/bash

# Read the JSON file
json=$(cat custom_emojis.json)

# Create a temporary file to store the filtered JSON
tmp_file=$(mktemp)

# Initialize a counter for successful URLs
success_count=0

echo "Filtering emojis..."

# Loop through each object in the JSON array
echo "$json" | jq -c '.[]' | while read obj; do
    # Extract the url from the object
    url=$(echo "$obj" | jq -r '.url')

# Check the response headers of the URL using curl
response=$(curl --silent --head "$url")
status_code=$(echo "$response" | grep -o 'HTTP/[0-9.]* [0-9]*' | awk '{print $2}')

# Check if the response status code is 200 (OK)
if [ "$status_code" -eq 200 ]; then
    # Check if the response headers contain the desired content type
    if echo "$response" | grep -q "Content-Type: image/"; then
        echo "$obj" >> "$tmp_file"
        ((success_count++))
        echo "Successful URL: $url"
    else
        echo "Failed URL: $url (Incorrect content type)"
    fi
else
    echo "Failed URL: $url (Status code: $status_code)"
fi
done

echo "$success_count emojis with successful URLs"

# Replace the original JSON file with the filtered version
echo "Updating custom_emojis.json..."
cat "$tmp_file" | jq -c '. | {shortcode, url}' > custom_emojis.json
rm "$tmp_file"

echo "Done!"