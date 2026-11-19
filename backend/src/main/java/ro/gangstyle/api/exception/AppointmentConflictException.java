package ro.gangstyle.api.exception;

/**
 * Thrown when a requested appointment overlaps with an already booked time slot
 * or violates scheduling conflict constraints.
 */
public class AppointmentConflictException extends RuntimeException {

    public AppointmentConflictException(String message) {
        super(message);
    }
}
