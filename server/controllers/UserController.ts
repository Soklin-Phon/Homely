import { validate } from "class-validator";
import { plainToClass } from "class-transformer";
import { Request, Response } from "express";
import ejs from "ejs";
import path from "path";
import {
  CreateUserInputs,
  ICreateUserTypes,
  IEditUserTypes,
  ILoginUserTypes,
  IPostReviewsTypes,
  IPasswordRecovery,
} from "../dto";
import { Review, User } from "../models";
import { SignAuthToken, ValidatePassword } from "../utility";
import sgMail from "@sendgrid/mail";
import { SENDGRID_API_KEY } from "../constant";

/* -------------------------- Create User with OTP -------------------------- */

export default async function SignUpUser(req: Request, res: Response) {
  const userInputs = plainToClass(CreateUserInputs, req.body);

  const inputErrors = await validate(userInputs, {
    validationError: { target: true },
  });

  if (inputErrors.length > 0) {
    res.status(400).send(inputErrors);
  }

  const { email, password, phone } = userInputs;

  // const user = await User.create({
  //   first_name,
  //   last_name,
  //   email,
  //   password,
  // });
}

/* ------------------------------- SignUp User ------------------------------ */

export async function CreateUser(req: Request, res: Response) {
  const { first_name, last_name, email, password } = <ICreateUserTypes>req.body;

  console.log(req.body);

  // check for existing user
  const existingUser = await User.findByEmail(email);

  if (existingUser !== null)
    return res.send({ message: "user already exits with this email" });

  try {
    const user = await User.create({
      first_name,
      last_name,
      email,
      password,
    });

    res.send(user);
  } catch (err) {
    res.send({ message: "An error occured in creating user", err: err });
  }
}

/* ------------------------------ Get All Users ----------------------------- */

export async function GetAllUsers(req: Request, res: Response) {
  try {
    const users = await User.find();

    return res.send(users);
  } catch (err) {
    return res.send({ message: "An error occured in all users" });
  }
}

/* ----------------------------- Get User By Id ----------------------------- */

export async function GetUserID(req: Request, res: Response) {
  const id = req.params.id;

  try {
    const user = await User.findById(id);

    return res.send(user);
  } catch (err) {
    res.send({ message: "An error occured in id" });
  }
}

/* ------------------------------- Login User ------------------------------- */

export async function UserLogin(req: Request, res: Response) {
  const { email, password } = <ILoginUserTypes>req.body;

  console.log(req.body);

  try {
    // check if user exists in database
    const existingUser = await User.findByEmail(email);

    if (existingUser !== null) {
      // compare saved and entered password
      const isValidPassword = await ValidatePassword(
        password,
        existingUser.password,
        existingUser.salt
      );

      if (isValidPassword) {
        const token = SignAuthToken({
          password: existingUser.password,
          email: existingUser.email,
        });

        existingUser.token = token;

        const user = await existingUser.save();

        return res.send(user);
      } else {
        return res.send({ message: "email or password is incorrect" });
      }
    } else {
      return res.send({ message: "access forbiden" });
    }
  } catch (err) {
    res.send({ message: "An error occured from somewhere" });
  }
}

/* ---------------------------- Get User Profile ---------------------------- */

export async function GetUserProfile(req: Request, res: Response) {
  const user = req.user;

  if (user) {
    const data = await User.findByEmail(user.email);

    return res.send(data);
  }

  return res.send({ message: "Unable to find user data" });
}

/* ---------------------------- Edit User Profile --------------------------- */

export async function EditUserProfile(req: Request, res: Response) {
  const user = req.user;

  if (user) {
    try {
      const fullUserData = await User.findByEmail(user.email);

      console.log(fullUserData);

      const { first_name, last_name } = <IEditUserTypes>req.body;

      fullUserData.first_name = first_name;
      fullUserData.last_name = last_name;

      const updatedUser = await fullUserData.save();

      console.log(updatedUser);

      res.status(200).send(updatedUser);
    } catch (err) {
      console.error(err);
      res.status(500).send("Internal server error");
    }
  } else {
    return res.status(500).send("Something went wrong, please try again");
  }
}

/* ------------------------- Post Review about User ------------------------- */

export async function PostUserReview(req: Request, res: Response) {
  const user = req.user;

  const { message } = <IPostReviewsTypes>req.body;

  if (user) {
    const receiver_id = req.params.id;

    try {
      const sender = await User.findByEmail(user.email);

      console.log(sender);

      const review = await Review.create({
        message: message,
        sender_id: sender._id,
        sender_name: sender.first_name,
        sender_avatar: sender.avatar,
      });

      const receiver = await User.findById(receiver_id);

      // check if receiver exist && prevent a user from posting a review about himself

      if (receiver && receiver._id == sender._id) {
        receiver.reviews.push(review);

        await receiver.save();
        res.send(review);
      } else {
        return res.send({
          message:
            "Reciever does not exist || receiver is trying to post about his profile",
        });
      }
    } catch (err) {
      return res.send({
        message: "somethin went wrong when trying to post a review",
        err: err,
      });
    }
  }
}

/* ---------------------------- Recover Password ---------------------------- */

export async function RecoverPassword(req: Request, res: Response) {
  const userInputs = plainToClass(IPasswordRecovery, req.body);

  const inputErrors = await validate(userInputs, {
    validationError: { target: true },
  });

  if (inputErrors.length > 0) {
    res.status(400).send(inputErrors);
  }

  const { email } = userInputs;

  try {
    const user = await User.findByEmail(email);

    if (user === null) {
      res.status(404).send({ message: "user not found!" });
    }

    ejs
      .renderFile(
        path.join(__dirname, "../", "views/password-recovery-email.ejs"),
        {
          id: user._id.toString(),
          time: `${new Date().toLocaleTimeString()} ${new Date().toDateString()}`,
          email: user.email,
        }
      )
      .then((emailTemplate) => {
        // Create a new email message
        const message = {
          to: email,
          from: "contact@aasalesimpex.com",
          subject: "Reset Password",
          html: emailTemplate,
        };

        // Send the email message
        sgMail.setApiKey(SENDGRID_API_KEY);

        sgMail
          .send(message)
          .then(() => {
            return res.status(200).send({ message: "email sent succesfully!" });
          })
          .catch((err) => {
            throw new Error(err);
          });
      })
      .catch((err) => {
        throw new Error(err);
      });
  } catch (err) {
    res.status(404).send({ message: "email not found!" });
  }
}

/* ----------------------------- Reset Password ----------------------------- */

export async function ResetPassword(req: Request, res: Response) {
  const { password } = <ILoginUserTypes>req.body;
  const user_id = req.params.id;

  // verify if a user exists
  try {
    const existingUser = await User.findById(user_id);

    if (existingUser !== null) {
      existingUser.password = password;

      try {
        const user = await existingUser.save();

        res.status(200).send(user);
      } catch (err) {
        res.status(500).send({ message: "Internal Server Error!" });
      }
    }
  } catch (err) {
    res.status(500).send({ message: "no such user with this email!" });
  }
}
