package ro.gangstyle.api.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import java.util.List;

@Document(collection = "barbers")
public class Barber {
    @Id
    private String id;

    @Indexed(unique = true)
    private String slug; // filip, sebi

    private String name;
    private String bio;
    private String photoUrl;
    private List<String> specialties;
    private List<String> portfolio;

    public Barber() {}

    public Barber(String slug, String name, String bio, String photoUrl, List<String> specialties, List<String> portfolio) {
        this.slug = slug;
        this.name = name;
        this.bio = bio;
        this.photoUrl = photoUrl;
        this.specialties = specialties;
        this.portfolio = portfolio;
    }

    public Barber(String id, String slug, String name, String bio, String photoUrl, List<String> specialties, List<String> portfolio) {
        this.id = id;
        this.slug = slug;
        this.name = name;
        this.bio = bio;
        this.photoUrl = photoUrl;
        this.specialties = specialties;
        this.portfolio = portfolio;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getSlug() { return slug; }
    public void setSlug(String slug) { this.slug = slug; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getBio() { return bio; }
    public void setBio(String bio) { this.bio = bio; }

    public String getPhotoUrl() { return photoUrl; }
    public void setPhotoUrl(String photoUrl) { this.photoUrl = photoUrl; }

    public List<String> getSpecialties() { return specialties; }
    public void setSpecialties(List<String> specialties) { this.specialties = specialties; }

    public List<String> getPortfolio() { return portfolio; }
    public void setPortfolio(List<String> portfolio) { this.portfolio = portfolio; }
}
