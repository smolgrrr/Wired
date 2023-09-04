/**
 * evaluate the difficulty of hex32 according to nip-13.
 * @param hex32 a string of 64 chars - 32 bytes in hex representation
 */
export const zeroLeadingBitsCount = (hex32: string) => {
    let count = 0;
    for (let i = 0; i < 64; i += 2) {
      const hexbyte = hex32.slice(i, i + 2); // grab next byte
      if (hexbyte === '00') {
        count += 8;
        continue;
      }
      // reached non-zero byte; count number of 0 bits in hexbyte
      const bits = parseInt(hexbyte, 16).toString(2).padStart(8, '0');
      for (let b = 0; b < 8; b++) {
        if (bits[b] === '1' ) {
          break; // reached non-zero bit; stop
        }
        count += 1;
      }
      break;
    }
    return count;
  };
  