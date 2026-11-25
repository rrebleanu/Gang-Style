package ro.gangstyle.api.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import ro.gangstyle.api.dto.ApiErrorResponse;
import ro.gangstyle.api.security.JwtAuthenticationFilter;

import java.util.List;

// Spring Security configuration with stateless JWT authentication and role-based access control.
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final ObjectMapper objectMapper;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter, ObjectMapper objectMapper) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.objectMapper = objectMapper;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                // Disable CSRF since REST APIs use stateless JWT authentication
                .csrf(AbstractHttpConfigurer::disable)
                // Enforce CORS whitelist for frontend origins
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                // Stateless session management: no HTTP sessions stored on server
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                // Handle 401 Unauthorized and 403 Forbidden with custom JSON error responses
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(authenticationEntryPoint())
                        .accessDeniedHandler(accessDeniedHandler())
                )
                .authorizeHttpRequests(auth -> auth
                        // Level 1: Public authentication and read-only endpoints
                        .requestMatchers(HttpMethod.POST, "/api/auth/login", "/auth/login").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/register", "/auth/register").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/2fa/verify", "/auth/2fa/verify").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/barbers/**").permitAll()
                        .requestMatchers(HttpMethod.PUT, "/api/barbers/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/services/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/availability/**", "/availability/**").permitAll()
                        // Level 2: Authenticated user operations (appointments CRUD & personal history)
                        .requestMatchers(HttpMethod.GET, "/api/appointments/my").hasAnyRole("CLIENT", "BARBER", "ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/appointments/*").hasAnyRole("CLIENT", "BARBER", "ADMIN")
                        .requestMatchers(HttpMethod.PATCH, "/api/appointments/*/status").hasAnyRole("BARBER", "ADMIN")
                        .requestMatchers(HttpMethod.PATCH, "/api/appointments/*/cancel").hasAnyRole("CLIENT", "BARBER", "ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/appointments/*").hasAnyRole("CLIENT", "BARBER", "ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/appointments").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/appointments/**").permitAll()
                        // 2FA configuration restricted to fully authenticated accounts
                        .requestMatchers("/api/auth/2fa/**", "/auth/2fa/**").hasAnyRole("CLIENT", "BARBER", "ADMIN")
                        // Level 3: Staff & Admin elevated endpoints
                        .requestMatchers(HttpMethod.POST, "/api/services/**").hasAnyRole("BARBER", "ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/services/**").hasAnyRole("BARBER", "ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/services/**").hasAnyRole("BARBER", "ADMIN")
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        // Fallback: any other request requires an authenticated token
                        .anyRequest().authenticated()
                )
                // Intercept every incoming HTTP request to extract and validate JWT bearer token
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    // Returns 401 Unauthorized when the user is unauthenticated or sends an invalid token.
    @Bean
    public AuthenticationEntryPoint authenticationEntryPoint() {
        return (request, response, authException) -> {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json;charset=UTF-8");
            ApiErrorResponse error = new ApiErrorResponse(
                    HttpStatus.UNAUTHORIZED.value(),
                    HttpStatus.UNAUTHORIZED.getReasonPhrase(),
                    "Autentificare necesară. Te rugăm să te conectezi.",
                    request.getRequestURI()
            );
            response.getWriter().write(objectMapper.writeValueAsString(error));
        };
    }

    // Returns 403 Forbidden when an authenticated user lacks the required role.
    @Bean
    public AccessDeniedHandler accessDeniedHandler() {
        return (request, response, accessDeniedException) -> {
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType("application/json;charset=UTF-8");
            ApiErrorResponse error = new ApiErrorResponse(
                    HttpStatus.FORBIDDEN.value(),
                    HttpStatus.FORBIDDEN.getReasonPhrase(),
                    "Acces interzis. Nu ai permisiunea necesară pentru această acțiune.",
                    request.getRequestURI()
            );
            response.getWriter().write(objectMapper.writeValueAsString(error));
        };
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOriginPatterns(List.of(
                "http://localhost:4200",
                "http://127.0.0.1:4200",
                "http://192.168.*:4200",
                "http://10.*:4200"
        ));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
