const moment    = require('moment')
const BigNumber = require('bignumber.js');

let  getCurrentISODT = ()=>{
    let dateObj =  new Date();
        return dateObj.toISOString();
}

let convToISODT = (datetime)=>{
    let isoDateTime =  new Date(datetime);
    return  isoDateTime.toISOString()
}
let checkIntNum = (number)=>{
    return !Number.isInteger(parseFloat(number))?0:number;
}
let isoFromDate = (dailyDate)=>{
        return  dailyDate.substring(0,10)
   
}

function formatBigNumber(bigNumber, decimalPlaces) {
    // Get the string representation of the BigNumber
    let formattedNumber = bigNumber.toString();
  
    // Split the string at the decimal point
    const parts = formattedNumber.split('.');
  
    // If there are decimal places and they exceed the desired precision, truncate
    if (parts[1] && parts[1].length > decimalPlaces) {
      parts[1] = parts[1].substr(0, decimalPlaces);
    }
  
    // Ensure there are exactly 'decimalPlaces' decimal places
    if (!parts[1]) {
      parts[1] = '0'.repeat(decimalPlaces);
    } else if (parts[1].length < decimalPlaces) {
      parts[1] += '0'.repeat(decimalPlaces - parts[1].length);
    }
  
    // Join the parts back together
    formattedNumber = parts.join('.');
  
    return formattedNumber;
  }


let insert = (tableName,insertObj)=>{


    let n = 0;
    let questionPlaceHolders = " ";
    while(n<Object.keys(insertObj).length){
        questionPlaceHolders = questionPlaceHolders+'?'+','
        n++;
    }
    questionPlaceHolders =  questionPlaceHolders.replace(/,(\s+)?$/, '');
    let placeHolderKeysValuesPaire = []
    for (let [key,value] of Object.entries(insertObj)) {        
        let obj = {
            [key]:value
        }
        placeHolderKeysValuesPaire.push(obj)
    }   


    let a = ` INSERT INTO ${tableName} SET ${questionPlaceHolders} `
    let b = placeHolderKeysValuesPaire

    return {
        sqlStr : a,
        holder : b,
    }


}



let isoToDate = (dateStr)=>{
    
var str = dateStr;
var date = moment(str);
var dateComponent = date.utc().format('YYYY-MM-DD');
return dateComponent
}

module.exports =  {getCurrentISODT,checkIntNum,formatBigNumber,convToISODT,isoFromDate,insert,isoToDate}