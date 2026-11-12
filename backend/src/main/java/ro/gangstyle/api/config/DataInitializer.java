package ro.gangstyle.api.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;
import ro.gangstyle.api.model.Appointment;
import ro.gangstyle.api.model.Barber;
import ro.gangstyle.api.model.ServicePackage;
import ro.gangstyle.api.model.User;
import ro.gangstyle.api.repository.AppointmentRepository;
import ro.gangstyle.api.repository.BarberRepository;
import ro.gangstyle.api.repository.ServicePackageRepository;
import ro.gangstyle.api.repository.UserRepository;

import java.time.Instant;
import java.util.List;

@Configuration
public class DataInitializer {

    private static final Logger log = LoggerFactory.getLogger(DataInitializer.class);

    @Bean
    public CommandLineRunner initDatabase(
            BarberRepository barberRepository,
            ServicePackageRepository servicePackageRepository,
            UserRepository userRepository,
            AppointmentRepository appointmentRepository,
            PasswordEncoder passwordEncoder) {

        return args -> {
            log.info("Checking MongoDB demo seed data...");

            // 1. Seed Barbers
            if (barberRepository.count() == 0) {
                log.info("Seeding barbers...");
                Barber filip = new Barber(
                        "filip",
                        "Filip",
                        "Specialist în tunsori moderne, skin fade impecabil și styling adaptat formei feței. 7+ ani de experiență.",
                        "images/Filip.jpg",
                        List.of("Skin Fade", "Texture Crop", "Modern Pompadour", "Beard Sculpting"),
                        List.of(
                                "images/Filip.jpg",
                                "images/Sebi.jpg"
                        )
                );

                Barber sebi = new Barber(
                        "sebi",
                        "Sebi",
                        "Maestru al stilului clasic, bărbierit tradițional cu prosop cald și contururi precise. Peste 5 ani în domeniu.",
                        "images/Sebi.jpg",
                        List.of("Classic Cut", "Hot Towel Shave", "Beard Grooming", "Scissor Work"),
                        List.of(
                                "images/Sebi.jpg",
                                "images/Filip.jpg"
                        )
                );

                barberRepository.saveAll(List.of(filip, sebi));
                log.info("Barbers seeded successfully.");
            }

            // 2. Seed Services
            if (servicePackageRepository.count() == 0) {
                log.info("Seeding service packages...");
                List<ServicePackage> services = List.of(
                        // Filip's services
                        new ServicePackage("filip", "Tuns Clasic", 45, 45, 60),
                        new ServicePackage("filip", "Tuns + Barbă", 60, 60, 85),
                        new ServicePackage("filip", "Skin Fade & Beard Styling", 75, 75, 110),
                        new ServicePackage("filip", "Aranjat Barbă & Contur", 30, 30, 45),
                        new ServicePackage("filip", "Pachet VIP GangStyle (Tuns + Barbă + Tratament)", 90, 90, 150),

                        // Sebi's services
                        new ServicePackage("sebi", "Tuns Tradițional", 45, 45, 55),
                        new ServicePackage("sebi", "Bărbierit Tradițional (Hot Towel)", 45, 45, 50),
                        new ServicePackage("sebi", "Tuns + Bărbierit Tradițional", 75, 75, 95),
                        new ServicePackage("sebi", "Îngrijire Barbă cu Uleiuri Premium", 30, 30, 40),
                        new ServicePackage("sebi", "Pachet Clasic Sebi (Tuns + Barba + Mască)", 90, 90, 135)
                );
                servicePackageRepository.saveAll(services);
                log.info("Service packages seeded successfully.");
            }

            // 3. Seed Users
            if (userRepository.count() == 0) {
                log.info("Seeding initial users (admin, barbers, client)...");
                User admin = new User(
                        "admin@gangstyle.ro",
                        passwordEncoder.encode("AdminPass123!"),
                        "Admin GangStyle",
                        "+40720000001",
                        "ROLE_ADMIN",
                        Instant.now()
                );

                User barberFilip = new User(
                        "filip@gangstyle.ro",
                        passwordEncoder.encode("FilipPass123!"),
                        "Filip Frizer",
                        "+40720000002",
                        "ROLE_BARBER",
                        Instant.now()
                );

                User barberSebi = new User(
                        "sebi@gangstyle.ro",
                        passwordEncoder.encode("SebiPass123!"),
                        "Sebi Frizer",
                        "+40720000003",
                        "ROLE_BARBER",
                        Instant.now()
                );

                User client = new User(
                        "client@gangstyle.ro",
                        passwordEncoder.encode("ClientPass123!"),
                        "Ion Popescu",
                        "+40720000004",
                        "ROLE_CLIENT",
                        Instant.now()
                );

                userRepository.saveAll(List.of(admin, barberFilip, barberSebi, client));
                log.info("Demo users seeded successfully.");
            }

            // 4. Seed Demo Appointments
            if (appointmentRepository.count() == 0) {
                log.info("Seeding demo appointments...");
                Appointment a1 = new Appointment(
                        "filip",
                        "Filip",
                        "images/Filip.jpg",
                        "srv-demo-1",
                        "Skin Fade & Beard Styling",
                        75,
                        75,
                        110,
                        "2026-11-12",
                        "Joi, 12 Noiembrie",
                        "10:00",
                        "11:15",
                        600,
                        675,
                        "Ion",
                        "Popescu",
                        "client@gangstyle.ro",
                        "+40720000004",
                        "Prima vizită la salon.",
                        "ONLINE",
                        "CONFIRMED",
                        Instant.now()
                );

                Appointment a2 = new Appointment(
                        "sebi",
                        "Sebi",
                        "images/Sebi.jpg",
                        "srv-demo-2",
                        "Tuns + Bărbierit Tradițional",
                        75,
                        75,
                        95,
                        "2026-11-12",
                        "Joi, 12 Noiembrie",
                        "14:00",
                        "15:15",
                        840,
                        915,
                        "Mihai",
                        "Ionescu",
                        "mihai@example.com",
                        "+40730000005",
                        "Preferă tuns scurt pe laterale.",
                        "ONLINE",
                        "CONFIRMED",
                        Instant.now()
                );

                appointmentRepository.saveAll(List.of(a1, a2));
                log.info("Demo appointments seeded successfully.");
            }

            log.info("MongoDB initialization completed.");
        };
    }
}
