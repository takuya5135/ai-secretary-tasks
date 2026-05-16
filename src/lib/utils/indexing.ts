const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const MIN_CHAR = ALPHABET[0]; // '0'
const MAX_CHAR = ALPHABET[ALPHABET.length - 1]; // 'z'

export function generateOrderString(prev: string | null, next: string | null): string {
    if (prev && next && prev === next) {
        throw new Error("prev and next cannot be equal");
    }

    if (!prev && !next) return ALPHABET[Math.floor(ALPHABET.length / 2)];

    let p = prev || '';
    let n = next || '';

    // padding with MIN_CHAR and mid-char if we need something smaller than next
    if (!p) {
        let i = 0;
        while (n[i] === MIN_CHAR) i++;
        return n.slice(0, i) + MIN_CHAR + ALPHABET[Math.floor(ALPHABET.length / 2)];
    }
    // padding with mid-char if we need something larger than prev
    if (!n) {
        return p + ALPHABET[Math.floor(ALPHABET.length / 2)];
    }

    let i = 0;
    while (i < p.length && i < n.length && p[i] === n[i]) {
        i++;
    }

    const prefix = p.substring(0, i);
    const pChar = p[i] || MIN_CHAR;
    const nChar = n[i] || MAX_CHAR;

    const pIndex = ALPHABET.indexOf(pChar);
    const nIndex = ALPHABET.indexOf(nChar);

    if (nIndex - pIndex > 1) {
        const midIndex = Math.floor((pIndex + nIndex) / 2);
        return prefix + ALPHABET[midIndex];
    } else {
        // They are adjacent or pIndex >= nIndex (if prev > next). 
        // Assuming prev < next always, we append to p.
        let remainingP = p.substring(i + 1);
        if (!remainingP) {
            return p + ALPHABET[Math.floor(ALPHABET.length / 2)];
        }
        return p.substring(0, i + 1) + generateOrderString(remainingP, null);
    }
}
