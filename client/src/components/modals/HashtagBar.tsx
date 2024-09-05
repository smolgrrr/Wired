const DefaultHashtags = ['asknostr', 'kinostr', 'technology'];

export default function HashtagBar() {

    return (
        <div className="flex justify-between items-center">
            <ul className='py-1 flex space-x-4 text-xs text-neutral-400 m-auto'>
                {DefaultHashtags.map((hashtag, index) => (
                    <li key={index}>
                        <a href={`/hashtag/${hashtag}`} className='hover:underline'>#{hashtag}</a>
                    </li>
                ))}
            </ul>
        </div>
    );
}
