const Otp = require("../schema/otpSchema");

const generatOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Existing function for post-registration (userId-based)
const createOtp = async (userId) => {
    const otp = generatOtp()

    const exist = await Otp.findOne({userId : userId})
    if(exist){
        await exist.deleteOne()
    }

    await Otp.create({
        otp : otp,
        userId : userId
    })

    return otp
}

// Existing function for post-registration (userId-based)
const validateOtp = async (userId, otp) => {
    const exist = await Otp.findOne({userId : userId})

    if (exist){
        if(exist.otp === otp.toString().trim()){
            await exist.deleteOne()
            return true
        }else{
            return false
        }
    }
    return false
}

// New function for pre-registration (email-based)
const createOtpForEmail = async (email, role) => {
    const otp = generatOtp()
    const lowerEmail = email.toLowerCase().trim()

    // Delete any existing OTP for this email+role combination
    const exist = await Otp.findOne({ email: lowerEmail, role })
    if(exist){
        await exist.deleteOne()
    }

    await Otp.create({
        otp: otp,
        email: lowerEmail,
        role: role
    })

    return otp
}

// New function for pre-registration (email-based)
const validateOtpByEmail = async (email, role, otp) => {
    const lowerEmail = email.toLowerCase().trim()
    const exist = await Otp.findOne({ email: lowerEmail, role })

    if (exist){
        if(exist.otp === otp.toString().trim()){
            await exist.deleteOne()
            return true
        }else{
            return false
        }
    }
    return false
}

module.exports = {
    validateOtp,
    createOtp,
    createOtpForEmail,
    validateOtpByEmail
}