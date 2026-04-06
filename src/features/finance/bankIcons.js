import iconNubank from '../../assets/icons/nubank.svg';
import iconInter from '../../assets/icons/inter.svg';
import iconItau from '../../assets/icons/itaú.svg';
import iconSicredi from '../../assets/icons/sicredi.svg';
import iconMercadoPago from '../../assets/icons/mercado-pago.svg';
import iconCardVisa from '../../assets/icons/card-visa.svg';
import iconCardMastercard from '../../assets/icons/card-mastercard.svg';
import iconCardElo from '../../assets/icons/card-elo.svg';
import iconCardAmex from '../../assets/icons/card-amex.svg';

/** Código ou alias da instituição (Pierre / Open Finance: providerCode) → asset */
const BY_CODE = {
    NUBANK: iconNubank,
    /** Nu Pagamentos S.A. — razão social comum na Pierre / CSV Bacen */
    NUPAGAMENTOS: iconNubank,
    NUPAGAMENTOSSA: iconNubank,
    NUPAGAMENTOSS: iconNubank,
    NU: iconNubank,
    INTER: iconInter,
    BANCOINTER: iconInter,
    ITAU: iconItau,
    ITAÚ: iconItau,
    ITAUUNIBANCO: iconItau,
    SICREDI: iconSicredi,
    MERCADOPAGO: iconMercadoPago,
    MERCADO_PAGO: iconMercadoPago,
    MERCADOLIVRE: iconMercadoPago,
};

function normalizeKey(s) {
    return String(s || '')
        .toUpperCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/[^A-Z0-9]/g, '');
}

function isNubankHaystack(codeRaw, name, codeNorm) {
    const hay = `${codeRaw} ${name}`.toLowerCase();
    if (hay.includes('nubank')) return true;
    if (hay.includes('nu pagamentos')) return true;
    if (hay.includes('nu pagamento')) return true;
    if (hay.replace(/\s/g, '').includes('nuconta')) return true;
    if (/\bnu\s*conta\b/i.test(name)) return true;
    if (codeNorm.includes('NUPAGAMENTOS')) return true;
    /** COMPE 260 — Nubank */
    if (String(codeRaw).trim() === '260' || codeNorm === '260') return true;
    /** ISPB Nu Pagamentos */
    if (String(codeRaw).trim() === '18236120') return true;
    return false;
}

/**
 * Bandeira do cartão (Visa, Mastercard, …) para badge ao lado do banco.
 * @param {{ credit_brand?: string | null } | string | null | undefined} accountOrBrand
 * @returns {string | null}
 */
export function getCardNetworkIconUrl(accountOrBrand) {
    const raw =
        typeof accountOrBrand === 'string'
            ? accountOrBrand
            : String(accountOrBrand?.credit_brand || '').trim();
    if (!raw) return null;
    const u = raw.toUpperCase();
    if (u.includes('VISA')) return iconCardVisa;
    if (u.includes('MASTERCARD') || u.includes('MASTER CARD') || u === 'MC') return iconCardMastercard;
    if (u.includes('ELO')) return iconCardElo;
    if (u.includes('AMEX') || u.includes('AMERICAN EXPRESS') || u.includes('AMERICANEXPRESS')) return iconCardAmex;
    const n = normalizeKey(raw);
    if (n.includes('VISA')) return iconCardVisa;
    if (n.includes('MASTER') || n.includes('MAESTRO')) return iconCardMastercard;
    if (n.includes('ELO')) return iconCardElo;
    if (n.includes('AMEX') || n.includes('AMERICANEXPRESS')) return iconCardAmex;
    return null;
}

/**
 * @param {{ institution?: string, name?: string, marketing_name?: string, credit_brand?: string, credit_level?: string }} account
 * @returns {string | null} URL do SVG ou null
 */
export function getBankIconUrl(account) {
    if (!account) return null;
    const codeRaw = String(account.institution || '').trim();
    const code = normalizeKey(codeRaw);
    if (code && BY_CODE[code]) return BY_CODE[code];

    const name = [account.name, account.marketing_name, account.credit_brand, account.credit_level]
        .filter(Boolean)
        .join(' ');
    if (isNubankHaystack(codeRaw, name, code)) return iconNubank;

    const hay = `${codeRaw} ${name}`.toLowerCase();
    const isBancoInter =
        hay.includes('banco inter') ||
        hay.includes('bancointer') ||
        /^inter\s*$/i.test(codeRaw.trim()) ||
        code === 'INTER';

    if (isBancoInter && !hay.includes('intermedium')) return iconInter;
    if (hay.includes('itau') || hay.includes('itaú')) return iconItau;
    if (hay.includes('sicredi')) return iconSicredi;
    if (hay.includes('mercado pago') || hay.includes('mercadopago')) return iconMercadoPago;

    return null;
}
