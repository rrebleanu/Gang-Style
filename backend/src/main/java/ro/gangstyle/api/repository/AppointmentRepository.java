package ro.gangstyle.api.repository;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;
import ro.gangstyle.api.model.Appointment;

import java.util.List;

@Repository
public interface AppointmentRepository extends MongoRepository<Appointment, String> {
    List<Appointment> findByBarberSlugAndDateIso(String barberSlug, String dateIso);
    List<Appointment> findByClientEmail(String clientEmail);
    List<Appointment> findByBarberSlug(String barberSlug);
}
