import turtle

# Set up the screen
window = turtle.Screen()
window.bgcolor("white")

# Create a turtle named "alex"
alex = turtle.Turtle()
alex.shape("turtle")
alex.color("blue")
alex.pensize(3)

# Draw a square using a loop
for _ in range(4):
    alex.forward(100)  # Move forward 100 pixels
    alex.left(90)      # Turn left 90 degrees

# Keep the window open until you click it
window.exitonclick()
