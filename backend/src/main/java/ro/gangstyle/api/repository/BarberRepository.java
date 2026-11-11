package ro.gangstyle.api.repository;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;
import ro.gangstyle.api.model.Barber;

import java.util.Optional;

@Repository
public interface BarberRepository extends MongoRepository<Barber, String> {
    Optional<Barber> findBySlug(String slug);
    boolean existsBySlug(String slug);
}
