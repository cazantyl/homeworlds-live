// piece.jsx
//
// One individual piece, could be a ship or a star

import React from 'react';

// Expected props: type ("ship" or "star"), serial (e.g. "b2C")
// Optional props: scaleFactor (default 0.4), rotation, symbolMode (boolean, default false)
function Piece(props) {
	// basically, "normal" adds nothing but "symbol" and "number" add their name and a hyphen
	const mode = props.displayMode || "normal";
	const extension = (mode === "normal") ? "" : `-${mode}`;
	// e.g. "/images/ship-b3.svg" or "/images/star-r2-symbol.svg"
	const imageSrc = "/images/" + props.type + "-" + props.serial.substring(0, 2) + extension + ".svg";
	// Use to rotate 0, 90, 180, or 270 degrees for ships
	const css = {
		transform: "rotate(" + (props.rotation || 0) + "deg)",
		...props.style
	};
	// Size is always the second character e.g. 2 in b2C
	const size = Number(props.serial[1]);
	// Get the height of a normal image.
	let baseWidth = 28 + 20*size;
	let baseHeight;
	if (props.type === "star") {
		baseHeight = 28 + 20 * size;
	} else if (props.type === "ship") {
		baseHeight = 40 + 32 * size;
	} else {
		throw new Error("Unknown piece type " + props.type + ". This is a bug.")
	}
	
	// Return the image element.
	return <img className="piece"
	            piecetype={props.type}
	            src={imageSrc}
	            width={props.scaleFactor * baseWidth}
	            height={props.scaleFactor * baseHeight}
	            style={css}
	            title={props.serial}
	            highlight={
	            	// why can we not make our own boolean attributes?
	            	props.highlight ? "yes" : undefined
	            }
	            onClick={(evt) => props.handleClick(props.serial, evt)} />
}

export default Piece;