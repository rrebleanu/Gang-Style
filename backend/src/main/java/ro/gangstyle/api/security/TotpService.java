package ro.gangstyle.api.security;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.ByteArrayOutputStream;
import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;

// Service implementing RFC 6238 TOTP generation, verification, and QR code rendering.
@Service
public class TotpService {

    private static final String BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    private static final String HMAC_ALGORITHM = "HmacSHA1";
    private static final String ISSUER = "GangStyle";
    private static final int SECRET_BYTES = 20;
    private static final int TIME_STEP_SECONDS = 30;
    private static final int CODE_DIGITS = 6;
    private static final int QR_SIZE = 250;

    private final SecureRandom secureRandom = new SecureRandom();

    // Generates a 160-bit random secret encoded in Base32 format.
    public String generateSecret() {
        byte[] buffer = new byte[SECRET_BYTES];
        secureRandom.nextBytes(buffer);
        return encodeBase32(buffer);
    }

    // Builds the standard otpauth URI for authenticator apps.
    public String buildOtpAuthUri(String email, String secret) {
        String encodedIssuer = URLEncoder.encode(ISSUER, StandardCharsets.UTF_8);
        String encodedAccount = URLEncoder.encode(email, StandardCharsets.UTF_8);
        return String.format(
                "otpauth://totp/%s:%s?secret=%s&issuer=%s&algorithm=SHA1&digits=%d&period=%d",
                encodedIssuer,
                encodedAccount,
                secret,
                encodedIssuer,
                CODE_DIGITS,
                TIME_STEP_SECONDS
        );
    }

    // Renders the otpauth URI into a Base64 PNG data URL for displaying a QR code.
    public String generateQrCodeDataUrl(String otpAuthUri) {
        try {
            QRCodeWriter qrCodeWriter = new QRCodeWriter();
            BitMatrix bitMatrix = qrCodeWriter.encode(otpAuthUri, BarcodeFormat.QR_CODE, QR_SIZE, QR_SIZE);
            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            MatrixToImageWriter.writeToStream(bitMatrix, "PNG", outputStream);
            String base64Png = Base64.getEncoder().encodeToString(outputStream.toByteArray());
            return "data:image/png;base64," + base64Png;
        } catch (Exception ex) {
            throw new IllegalStateException("Eroare la generarea codului QR pentru 2FA.", ex);
        }
    }

    // Verifies a 6-digit TOTP code against the secret with a +/- 1 time step tolerance.
    public boolean verifyCode(String secret, String code) {
        if (secret == null || secret.isBlank() || code == null) {
            return false;
        }
        String sanitizedCode = code.trim();
        if (!sanitizedCode.matches("^\\d{6}$")) {
            return false;
        }

        long currentBucket = Instant.now().getEpochSecond() / TIME_STEP_SECONDS;
        byte[] keyBytes = decodeBase32(secret);

        for (int offset = -1; offset <= 1; offset++) {
            String candidate = generateCodeForCounter(keyBytes, currentBucket + offset);
            if (candidate.equals(sanitizedCode)) {
                return true;
            }
        }
        return false;
    }

    // Computes the current 6-digit TOTP code for the active 30-second window.
    public String generateCurrentCode(String secret) {
        long currentBucket = Instant.now().getEpochSecond() / TIME_STEP_SECONDS;
        byte[] keyBytes = decodeBase32(secret);
        return generateCodeForCounter(keyBytes, currentBucket);
    }

    // Implements the RFC 4226 / RFC 6238 HMAC-SHA1 dynamic truncation algorithm.
    private String generateCodeForCounter(byte[] key, long counter) {
        try {
            byte[] counterBytes = ByteBuffer.allocate(8).putLong(counter).array();
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(key, HMAC_ALGORITHM));
            byte[] hash = mac.doFinal(counterBytes);

            int offset = hash[hash.length - 1] & 0x0F;
            int binary = ((hash[offset] & 0x7F) << 24)
                    | ((hash[offset + 1] & 0xFF) << 16)
                    | ((hash[offset + 2] & 0xFF) << 8)
                    | (hash[offset + 3] & 0xFF);

            int otp = binary % 1_000_000;
            return String.format("%06d", otp);
        } catch (Exception ex) {
            throw new IllegalStateException("Eroare la calcularea codului TOTP.", ex);
        }
    }

    private String encodeBase32(byte[] data) {
        StringBuilder result = new StringBuilder((data.length * 8 + 4) / 5);
        int buffer = data[0];
        int next = 1;
        int bitsLeft = 8;

        while (bitsLeft > 0 || next < data.length) {
            if (bitsLeft < 5) {
                if (next < data.length) {
                    buffer <<= 8;
                    buffer |= (data[next++] & 0xFF);
                    bitsLeft += 8;
                } else {
                    int pad = 5 - bitsLeft;
                    buffer <<= pad;
                    bitsLeft += pad;
                }
            }
            int index = 0x1F & (buffer >> (bitsLeft - 5));
            bitsLeft -= 5;
            result.append(BASE32_ALPHABET.charAt(index));
        }
        return result.toString();
    }

    private byte[] decodeBase32(String base32) {
        String clean = base32.trim().replace("=", "").replace(" ", "").toUpperCase();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        int buffer = 0;
        int bitsLeft = 0;

        for (int i = 0; i < clean.length(); i++) {
            int val = BASE32_ALPHABET.indexOf(clean.charAt(i));
            if (val < 0) {
                continue;
            }
            buffer = (buffer << 5) | val;
            bitsLeft += 5;
            if (bitsLeft >= 8) {
                out.write((buffer >> (bitsLeft - 8)) & 0xFF);
                bitsLeft -= 8;
            }
        }
        return out.toByteArray();
    }
}
