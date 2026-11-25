package ro.gangstyle.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class GangStyleApiApplication {

    public static void main(String[] args) {
        SpringApplication.run(GangStyleApiApplication.class, args);
    }
}
