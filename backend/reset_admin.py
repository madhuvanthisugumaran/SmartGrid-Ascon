
import getpass
import app


def reset_admin_password():
    username = "admin"

    print("SmartGrid Admin Password Reset")
    print("--------------------------------")

    password = getpass.getpass("Enter new admin password: ")
    confirm_password = getpass.getpass("Confirm new password: ")

    if not password:
        print("Error: Password cannot be empty.")
        return

    if password != confirm_password:
        print("Error: Passwords do not match.")
        return

    try:
        app.init()

        with app.db() as conn:
            user = conn.execute(
                "SELECT id FROM users WHERE username = ?",
                (username,)
            ).fetchone()

            if user is None:
                print("Admin account not found.")
                print("No changes were made.")
                return

            password_hash = app.ph.hash(password)

            conn.execute(
                "UPDATE users SET pw_hash = ? WHERE username = ?",
                (password_hash, username)
            )

        print("\nAdmin password reset successfully.")
        print("Username: admin")
        print("You can now log in using your new password.")

    except Exception as error:
        print("Password reset failed:", error)


if __name__ == "__main__":
    reset_admin_password()
