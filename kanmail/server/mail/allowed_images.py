from functools import lru_cache

from kanmail.server.app import db


class AllowedImage(db.Model):
    __bind_key__ = 'contacts'
    __tablename__ = 'allowed_images'
    __table_args__ = (
        db.UniqueConstraint('email'),
    )

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(300))


@lru_cache(maxsize=1)
def get_allowed_image_emails():
    return [image.email for image in AllowedImage.query.all()]


def is_email_allowed_images(email):
    return email in get_allowed_image_emails()


def allow_images_for_email(email):
    if email in get_allowed_image_emails():
        return

    image = AllowedImage(email=email)

    db.session.add(image)
    db.session.commit()

    get_allowed_image_emails.cache_clear()


def disallow_images_for_email(email):
    if email not in get_allowed_image_emails():
        return

    image = AllowedImage.query.filter_by(email=email).one()

    db.session.delete(image)
    db.session.commit()

    get_allowed_image_emails.cache_clear()
