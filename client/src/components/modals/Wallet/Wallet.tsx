export default function Wallet() {
    return (
    <div className="flex flex-col items-center text-2xl mx-auto mb-5">
        <div>Wallet</div>
        <div><span className="">0<i className="fak fa-regular"></i></span></div>
        <div className="flex gap-4 mt-4">
        <button className="px-4 py-2 border border-neutral-500 text-white rounded">Withdraw</button>
        <button className="px-4 py-2 border border-neutral-500 text-white rounded">Deposit</button>
      </div>
    </div>
    );
  }