package ro.gangstyle.api.repository;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;
import ro.gangstyle.api.model.Appointment;

import java.util.List;

@Repository
public interface AppointmentRepository extends MongoRepository<Appointment, String> {

    List<Appointment> findByBarberSlugAndDateIso(String barberSlug, String dateIso);

    List<Appointment> findByBarberSlugOrderByDateIsoAscStartTimeAsc(String barberSlug);

    List<Appointment> findByDateIsoOrderByStartTimeAsc(String dateIso);

    List<Appointment> findByClientEmailOrderByDateIsoDescStartTimeDesc(String clientEmail);

    List<Appointment> findByClientEmail(String clientEmail);

    List<Appointment> findByClientPhone(String clientPhone);

    List<Appointment> findByBarberSlug(String barberSlug);
}
