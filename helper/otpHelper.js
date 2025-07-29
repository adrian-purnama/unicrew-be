const Otp = require("../schema/otpSchema");

const generatOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

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

module.exports = {
    validateOtp,
    createOtp
}