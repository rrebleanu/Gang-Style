package ro.gangstyle.api.dto;

// DTO returned when generating a TOTP secret and QR code for 2FA setup.
public class TwoFactorSetupResponseDto {

    private String secret;
    private String otpAuthUri;
    private String qrCodeDataUrl;
    private boolean twoFactorEnabled;

    public TwoFactorSetupResponseDto() {}

    public TwoFactorSetupResponseDto(String secret, String otpAuthUri, String qrCodeDataUrl, boolean twoFactorEnabled) {
        this.secret = secret;
        this.otpAuthUri = otpAuthUri;
        this.qrCodeDataUrl = qrCodeDataUrl;
        this.twoFactorEnabled = twoFactorEnabled;
    }

    public String getSecret() { return secret; }
    public void setSecret(String secret) { this.secret = secret; }

    public String getOtpAuthUri() { return otpAuthUri; }
    public void setOtpAuthUri(String otpAuthUri) { this.otpAuthUri = otpAuthUri; }

    public String getQrCodeDataUrl() { return qrCodeDataUrl; }
    public void setQrCodeDataUrl(String qrCodeDataUrl) { this.qrCodeDataUrl = qrCodeDataUrl; }

    public boolean isTwoFactorEnabled() { return twoFactorEnabled; }
    public void setTwoFactorEnabled(boolean twoFactorEnabled) { this.twoFactorEnabled = twoFactorEnabled; }
}
