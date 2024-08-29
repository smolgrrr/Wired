import { useEffect, useState } from "react";

// Function to check media against the API
const checkMedia = async (url: string) => {
  try {
    const token = process.env.REACT_APP_NSFW_TOKEN;
    if (!token) {
      console.error("NSFW token is not set in environment variables");
      return null;
    }

    const response = await fetch('https://nsfw-detector-api-latest.onrender.com/predict', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ url }),
    });
    return await response.json();
  } catch (error) {
    console.error("Error checking media:", error);
    return null;
  }
};

const RenderMedia = ({ files }: { files: string[] }) => {
  const gridTemplateColumns = files.length > 1 ? 'repeat(2, 1fr)' : 'repeat(1, 1fr)';
  const gridTemplateRows = files.length > 2 ? 'repeat(2, 1fr)' : 'repeat(1, 1fr)';
  const whitelistImageURL = ["nostr.build", "void.cat", "blossom.oxtr", "image.nostr.build"];
  const [mediaCheckResults, setMediaCheckResults] = useState<Record<string, any>>({});

  // Function to toggle blur on click
  const toggleBlur = (event: React.MouseEvent<HTMLImageElement>) => {
    event.currentTarget.classList.toggle('no-blur');
  };

  useEffect(() => {
    const performMediaChecks = async () => {
      for (const file of files) {
        const result = await checkMedia(file);
        console.log(`Result for ${file}:`, result);
        if (result && result.data && result.data.predictedLabel) {
          setMediaCheckResults(prev => ({
            ...prev,
            [file]: { predictedLabel: result.data.predictedLabel }
          }));
          console.error(`Unexpected result structure for ${file}:`, result.data.predictedLabel);
        } else {
          console.error(`Unexpected result structure for ${file}:`, result);
        }
      }
    };

    if (Object.keys(mediaCheckResults).length === 0) {
    performMediaChecks();
    }
  }, []);

  return (
    <div style={{ display: 'grid', gridTemplateColumns, gridTemplateRows, gap: '2px' }}>
      {files.map((file, index) => {
        // Check if the file is from allowed domains
        const isFromAllowedDomain = whitelistImageURL.some(domain => file.includes(domain));
        const mediaCheckResult = mediaCheckResults[file];
        
        // Only render if predictedLabel is neutral
        if (mediaCheckResult && mediaCheckResult.predictedLabel !== 'neutral') {
          return (
            <div>
              <p className="text-center text-red-500 text-xs">Attached media has been flagged as not safe for work.</p>
            </div>
          );
        }

        if (file && (file.endsWith(".mp4") || file.endsWith(".webm")) && mediaCheckResult && mediaCheckResult.predictedLabel === 'neutral') {
          return (
            <video
              key={index}
              controls
              muted
              src={file + "#t=0.1"}
              preload="metadata"
              className="thumb mt-1 rounded-md w-full"
            >
              <source src={file} type="video/mp4" />
            </video>
          );
        } else if (file && mediaCheckResult && mediaCheckResult.predictedLabel === 'neutral') {
          return (
            <img
              key={index}
              alt="Invalid thread"
              loading="lazy"
              className={`thumb mt-2 max-w-64 min-h-64 mx-auto rounded-md`}
              src={file}
              onClick={isFromAllowedDomain ? undefined : toggleBlur} // Only add onClick if blur is applied
            />
          );
        } else {
          return (
            <div>
              <p className="text-center text-white-500 text-xs">Checking media...</p>
            </div>
          );
        } 
      })}
    </div>
  );
};

export default RenderMedia;