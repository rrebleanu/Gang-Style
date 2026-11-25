package ro.gangstyle.api.service;

import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import ro.gangstyle.api.model.Appointment;

/**
 * Service for sending HTML appointment confirmation and reminder emails.
 * Supports dual mode:
 * - Development / Local: cleanly logs the generated email details to the console without failing.
 * - Production: dispatches responsive HTML emails via SMTP (e.g. Gmail App Password, Resend, or Brevo).
 */
@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);

    private final ObjectProvider<JavaMailSender> mailSenderProvider;

    @Value("${spring.mail.username:}")
    private String mailUsername;

    @Value("${spring.mail.password:}")
    private String mailPassword;

    @Value("${gangstyle.mail.from:Gang Style Barbershop <gangstylegiurgiu@gmail.com>}")
    private String mailFrom;

    public EmailService(ObjectProvider<JavaMailSender> mailSenderProvider) {
        this.mailSenderProvider = mailSenderProvider;
    }

    /**
     * Determines whether real SMTP dispatch is enabled and configured with non-empty credentials.
     */
    public boolean isSmtpConfigured() {
        return mailUsername != null && !mailUsername.trim().isBlank()
                && mailPassword != null && !mailPassword.trim().isBlank();
    }

    /**
     * Asynchronously dispatches an appointment confirmation email to the client.
     * Wrapped in try-catch so email failures never disrupt appointment creation.
     */
    @Async
    public void sendAppointmentConfirmationAsync(Appointment appointment) {
        if (appointment == null) {
            return;
        }

        String recipientEmail = appointment.getClientEmail();
        if (recipientEmail == null || recipientEmail.trim().isBlank() || !recipientEmail.contains("@")) {
            log.debug("No valid client email provided for appointment [{}]. Skipping email confirmation.", appointment.getId());
            return;
        }

        recipientEmail = recipientEmail.trim().toLowerCase();

        try {
            if (!isSmtpConfigured()) {
                // Development / Mock mode: log formatted appointment confirmation in console
                log.info("""
                        
                        ================================================================================
                        [EMAIL SERVICE - DEV / MOCK MODE]
                        To: {}
                        Client: {} {}
                        Subject: Confirmare Rezervare · Gang Style Giurgiu
                        --------------------------------------------------------------------------------
                        Frizer:    {}
                        Serviciu:  {} ({} min, {} RON)
                        Data:      {} ({})
                        Interval:  {} - {}
                        Locatie:   Str. Nicolae Bălcescu, Giurgiu (Gang Style)
                        --------------------------------------------------------------------------------
                        Status: Email generat cu succes!
                        (Pentru trimitere pe o casuta reala de email, seteaza MAIL_USERNAME si MAIL_PASSWORD in application.properties)
                        ================================================================================
                        """,
                        recipientEmail,
                        appointment.getClientLastName(),
                        appointment.getClientFirstName(),
                        appointment.getBarberName(),
                        appointment.getServiceName(),
                        appointment.getDurationMinutes(),
                        appointment.getPriceRon(),
                        appointment.getDateLabel(),
                        appointment.getDateIso(),
                        appointment.getStartTime(),
                        appointment.getEndTime()
                );
                return;
            }

            JavaMailSender mailSender = mailSenderProvider.getIfAvailable();
            if (mailSender == null) {
                log.warn("JavaMailSender bean is unavailable. Skipping email dispatch to {}", recipientEmail);
                return;
            }

            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");

            helper.setFrom(mailFrom);
            helper.setTo(recipientEmail);
            helper.setSubject("Confirmare Rezervare · Gang Style Barber Shop");

            String htmlContent = buildConfirmationHtml(appointment);
            helper.setText(htmlContent, true);

            mailSender.send(message);
            log.info("Sent appointment confirmation email [{}] to {}", appointment.getId(), recipientEmail);

        } catch (Exception ex) {
            log.warn("Could not dispatch confirmation email for appointment [{}] to {}: {}",
                    appointment.getId(), recipientEmail, ex.getMessage());
        }
    }

    /**
     * Builds a luxury, responsive Dark & Gold HTML email template matching the Gang Style brand.
     */
    private String buildConfirmationHtml(Appointment apt) {
        String clientName = (apt.getClientFirstName() != null ? apt.getClientFirstName() : "Client").trim();
        String barberName = apt.getBarberName() != null ? apt.getBarberName() : "Frizer";
        String serviceName = apt.getServiceName() != null ? apt.getServiceName() : "Serviciu";
        String dateLabel = apt.getDateLabel() != null ? apt.getDateLabel() : apt.getDateIso();
        String timeRange = apt.getStartTime() + " - " + apt.getEndTime();
        String duration = apt.getDurationMinutes() > 0 ? apt.getDurationMinutes() + " min" : "30 min";
        String price = apt.getPriceRon() > 0 ? ((int) apt.getPriceRon()) + " RON" : "Standard";

        return """
                <!DOCTYPE html>
                <html lang="ro">
                <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <title>Confirmare Rezervare Gang Style</title>
                </head>
                <body style="margin: 0; padding: 0; background-color: #0d0d0d; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f4f4f4;">
                  <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="background-color: #0d0d0d; padding: 24px 12px;">
                    <tr>
                      <td align="center">
                        <table role="presentation" width="100%%" style="max-width: 560px; background-color: #171717; border: 1px solid #b39268; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.6);">
                          
                          <!-- Header -->
                          <tr>
                            <td align="center" style="padding: 28px 20px 20px; background: linear-gradient(180deg, #222222 0%%, #171717 100%%); border-bottom: 1px solid rgba(179,146,104,0.3);">
                              <div style="font-size: 22px; font-weight: 800; letter-spacing: 0.14em; color: #b39268; text-transform: uppercase;">
                                GANG STYLE
                              </div>
                              <div style="font-size: 10px; letter-spacing: 0.35em; color: #a0a0a0; margin-top: 4px; text-transform: uppercase;">
                                EST 2020 &middot; BARBER SHOP GIURGIU
                              </div>
                            </td>
                          </tr>

                          <!-- Body -->
                          <tr>
                            <td style="padding: 28px 24px;">
                              <h1 style="margin: 0 0 8px; font-size: 19px; font-weight: 700; color: #ffffff;">
                                Salut, %s!
                              </h1>
                              <p style="margin: 0 0 22px; font-size: 14px; line-height: 1.5; color: #cccccc;">
                                Rezervarea ta la <strong>Gang Style</strong> a fost confirmat&#259; cu succes &#238;n salon. Te a&#537;tept&#259;m cu drag!
                              </p>

                              <!-- Appointment Box -->
                              <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="background-color: #1f1f1f; border: 1px solid rgba(179,146,104,0.35); border-radius: 8px; margin-bottom: 22px;">
                                <tr>
                                  <td style="padding: 16px 18px;">
                                    
                                    <table role="presentation" width="100%%" cellspacing="0" cellpadding="6" border="0" style="font-size: 13px;">
                                      <tr>
                                        <td style="color: #999999; width: 32%%; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em;">Frizer:</td>
                                        <td style="color: #b39268; font-weight: 700; font-size: 14px;">%s</td>
                                      </tr>
                                      <tr>
                                        <td style="color: #999999; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em;">Serviciu:</td>
                                        <td style="color: #ffffff; font-weight: 600;">%s</td>
                                      </tr>
                                      <tr>
                                        <td style="color: #999999; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em;">Data:</td>
                                        <td style="color: #ffffff; font-weight: 600;">%s</td>
                                      </tr>
                                      <tr>
                                        <td style="color: #999999; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em;">Ora:</td>
                                        <td style="color: #b39268; font-weight: 800; font-size: 15px;">%s <span style="font-size: 12px; font-weight: normal; color: #888888;">(%s)</span></td>
                                      </tr>
                                      <tr>
                                        <td style="color: #999999; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em;">Tarif:</td>
                                        <td style="color: #ffffff; font-weight: 700;">%s</td>
                                      </tr>
                                    </table>

                                  </td>
                                </tr>
                              </table>

                              <!-- Salon Address & Directions -->
                              <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="background-color: #1a1a1a; border-left: 3px solid #b39268; padding: 12px 16px; margin-bottom: 22px; border-radius: 4px;">
                                <tr>
                                  <td>
                                    <div style="font-size: 12px; font-weight: 700; color: #b39268; text-transform: uppercase; margin-bottom: 4px;">
                                      &#128205; Loca&#539;ie Salon:
                                    </div>
                                    <div style="font-size: 13px; color: #dddddd; line-height: 1.4;">
                                      Giurgiu, Bulevardul Bucure&#537;ti / Str. Nicolae B&#259;lcescu (vis-a-vis de Parc)
                                    </div>
                                    <div style="margin-top: 8px;">
                                      <a href="https://maps.google.com/?q=Gang+Style+Barber+Shop+Giurgiu" target="_blank" style="color: #b39268; font-size: 12px; font-weight: 600; text-decoration: underline;">
                                        Deschide traseul pe Google Maps &rarr;
                                      </a>
                                    </div>
                                  </td>
                                </tr>
                              </table>

                              <!-- Client note -->
                              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #888888; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 14px;">
                                &#9200; <em>Te rug&#259;m s&#259; ajungi cu 5 minute &#238;nainte de ora programat&#259;. Dac&#259; intervine ceva neprev&#259;zut, po&#539;i anula sau reprograma cu cel pu&#539;in 3 ore &#238;nainte din contul t&#259;u sau apel&#226;nd frizerul.</em>
                              </p>

                            </td>
                          </tr>

                          <!-- Footer -->
                          <tr>
                            <td align="center" style="padding: 16px 20px; background-color: #121212; border-top: 1px solid rgba(255,255,255,0.06); font-size: 11px; color: #666666;">
                              &copy; 2026 Gang Style &middot; Barber Shop Giurgiu &middot; Tel: 0770 426 308
                            </td>
                          </tr>

                        </table>
                      </td>
                    </tr>
                  </table>
                </body>
                </html>
                """.formatted(clientName, barberName, serviceName, dateLabel, timeRange, duration, price);
    }
}
