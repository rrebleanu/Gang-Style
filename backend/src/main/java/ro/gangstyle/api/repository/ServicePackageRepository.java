package ro.gangstyle.api.repository;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;
import ro.gangstyle.api.model.ServicePackage;

import java.util.List;

@Repository
public interface ServicePackageRepository extends MongoRepository<ServicePackage, String> {
    List<ServicePackage> findByBarberSlug(String barberSlug);
}
