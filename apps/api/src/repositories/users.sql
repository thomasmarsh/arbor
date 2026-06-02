/* @name FindUserById */
SELECT id, email, created_at FROM users WHERE id = :id;

/* @name FindAllUsers */
SELECT id, email, created_at FROM users;

/* @name CreateUser */
INSERT INTO users (email) VALUES (:email) RETURNING id, email, created_at;