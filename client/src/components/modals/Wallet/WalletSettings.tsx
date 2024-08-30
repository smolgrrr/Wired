export default function WalletSettings() {
    return (
        <div className="settings-page pt-10">
        <h1 className="text-lg font-semibold mb-4">Wallet Settings</h1>
        <form onSubmit={(e) => {e.preventDefault();}}>
        <div className="flex flex-wrap -mx-2 mb-4">
          <div className="w-full md:w-1/2 px-2 mb-4">
            <label className="block text-xs mb-2" htmlFor="mintUrls">
              <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                Mint URLs:
              </span>
            </label>
            <textarea
              id="mintUrls"
              className="w-full px-3 py-2 border rounded-md bg-black"
              placeholder="Enter mint URLs, one per line"
              rows={3}
            />
          </div>
          <div className="w-full md:w-1/2 px-2 mb-4">
            <label className="block text-xs mb-2" htmlFor="relayUrls">
              <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                Relay URLs:
              </span>
            </label>
            <textarea
              id="relayUrls"
              className="w-full px-3 py-2 border rounded-md bg-black"
              placeholder="Enter relay URLs, one per line"
              rows={3}
            />
          </div>
        </div>
        <button
          type="submit"
          className="bg-black border text-white font-bold py-2 px-4 rounded">
          Save
        </button>
      </form>
      </div>
    );
  }